"""
Shared async HTTP client utility for all connector agents.

Provides retry logic with exponential backoff, timeout handling,
structured error classification, auth header injection, proxy support,
and OAuth2 client credentials token exchange.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, Optional, Tuple

import httpx

from app.connectors.base.interface import (
    ConnectorAuthStrategy,
    ConnectorConfig,
    ConnectorCredentials,
)

logger = logging.getLogger(__name__)

_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
_NON_RETRYABLE_STATUS_CODES = {400, 401, 403, 404, 405, 422}


class ConnectorHTTPError(Exception):
    def __init__(self, message: str, status_code: Optional[int] = None, retryable: bool = False) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.retryable = retryable


class ConnectorTimeoutError(ConnectorHTTPError):
    def __init__(self, url: str, timeout_seconds: int) -> None:
        super().__init__(
            f"Request to {url} timed out after {timeout_seconds}s",
            retryable=True,
        )
        self.url = url
        self.timeout_seconds = timeout_seconds


class ConnectorAuthError(ConnectorHTTPError):
    def __init__(self, message: str = "Authentication failed") -> None:
        super().__init__(message, status_code=401, retryable=False)


def _build_auth_headers(credentials: ConnectorCredentials) -> Dict[str, str]:
    """Build HTTP Authorization headers based on the auth strategy."""
    headers: Dict[str, str] = {}
    strategy = credentials.strategy

    if strategy == ConnectorAuthStrategy.BEARER_TOKEN:
        if credentials.token:
            headers["Authorization"] = f"Bearer {credentials.token}"

    elif strategy == ConnectorAuthStrategy.SPLUNK_TOKEN:
        if credentials.token:
            headers["Authorization"] = f"Splunk {credentials.token}"

    elif strategy == ConnectorAuthStrategy.API_KEY_HEADER:
        header_name = credentials.api_key_header_name or "X-API-Key"
        if credentials.api_key:
            headers[header_name] = credentials.api_key

    return headers


def _build_auth_tuple(
    credentials: ConnectorCredentials,
) -> Optional[Tuple[str, str]]:
    """Return (username, password) tuple for Basic Auth, or None."""
    if credentials.strategy == ConnectorAuthStrategy.BASIC_AUTH:
        return (credentials.username or "", credentials.password or "")
    return None


def _build_proxy_mounts(config: ConnectorConfig) -> Optional[Dict[str, Any]]:
    """Build httpx proxy mounts dict if proxy is configured."""
    if not config.proxy_url:
        return None
    proxy = httpx.Proxy(url=config.proxy_url)
    return {"http://": proxy, "https://": proxy}


async def _fetch_oauth2_token(
    credentials: ConnectorCredentials,
    config: ConnectorConfig,
) -> str:
    """Exchange client credentials for an OAuth2 Bearer token."""
    token_url = credentials.extra.get("token_url", "")
    if not token_url:
        raise ConnectorAuthError("OAuth2 token_url is required for client_credentials flow")

    if not credentials.client_id or not credentials.client_secret:
        raise ConnectorAuthError("client_id and client_secret are required for OAuth2 client_credentials flow")

    proxy_mounts = _build_proxy_mounts(config)
    verify = config.verify_ssl if not proxy_mounts else config.proxy_strict_ssl

    client_kwargs: Dict[str, Any] = {
        "timeout": 30,
        "verify": verify,
        "follow_redirects": True,
    }
    if proxy_mounts:
        client_kwargs["mounts"] = proxy_mounts

    async with httpx.AsyncClient(**client_kwargs) as client:
        response = await client.post(
            token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": credentials.client_id,
                "client_secret": credentials.client_secret,
            },
        )

    if response.status_code != 200:
        raise ConnectorAuthError(
            f"OAuth2 token exchange failed with status {response.status_code}: {response.text[:200]}"
        )

    token_data = response.json()
    access_token = token_data.get("access_token")
    if not access_token:
        raise ConnectorAuthError("OAuth2 token response did not contain access_token")
    return str(access_token)


class ConnectorHTTPClient:
    """
    Async HTTP client with retry, backoff, auth injection, and proxy support.

    Instantiate per connector execution — not a long-lived singleton.
    """

    def __init__(self, config: ConnectorConfig, credentials: ConnectorCredentials) -> None:
        self._config = config
        self._credentials = credentials
        self._base_headers = _build_auth_headers(credentials)
        self._auth_tuple = _build_auth_tuple(credentials)
        self._oauth2_token: Optional[str] = None
        self._logger = logging.getLogger(f"{__name__}.client")

    async def _resolve_auth_headers(self) -> Dict[str, str]:
        """Resolve headers, fetching OAuth2 token if needed."""
        if self._credentials.strategy == ConnectorAuthStrategy.OAUTH2_CLIENT_CREDENTIALS:
            if not self._oauth2_token:
                self._oauth2_token = await _fetch_oauth2_token(self._credentials, self._config)
            return {"Authorization": f"Bearer {self._oauth2_token}"}
        return dict(self._base_headers)

    async def request(
        self,
        method: str,
        path: str,
        *,
        extra_headers: Optional[Dict[str, str]] = None,
        params: Optional[Dict[str, Any]] = None,
        json_body: Optional[Dict[str, Any]] = None,
        timeout_override: Optional[int] = None,
        skip_retry: bool = False,
    ) -> Tuple[httpx.Response, int]:
        """
        Execute an HTTP request with retry/backoff.

        Returns (response, elapsed_ms).
        Raises ConnectorHTTPError, ConnectorTimeoutError, or ConnectorAuthError.
        """
        url = self._config.base_url.rstrip("/") + "/" + path.lstrip("/")
        timeout = timeout_override or self._config.timeout_seconds
        auth_headers = await self._resolve_auth_headers()
        headers = {**auth_headers, **(extra_headers or {})}
        max_retries = 1 if skip_retry else self._config.max_retries
        backoff = self._config.retry_backoff_factor

        proxy_mounts = _build_proxy_mounts(self._config)
        verify = self._config.verify_ssl if not proxy_mounts else self._config.proxy_strict_ssl

        last_exc: Optional[Exception] = None
        for attempt in range(max_retries):
            if attempt > 0:
                wait = backoff * (2 ** (attempt - 1))
                self._logger.debug("Retry %d/%d after %.1fs for %s", attempt, max_retries - 1, wait, url)
                await asyncio.sleep(wait)

            try:
                t0 = time.monotonic()
                client_kwargs: Dict[str, Any] = {
                    "timeout": timeout,
                    "verify": verify,
                    "follow_redirects": True,
                }
                if proxy_mounts:
                    client_kwargs["mounts"] = proxy_mounts

                async with httpx.AsyncClient(**client_kwargs) as client:
                    kwargs: Dict[str, Any] = {
                        "headers": headers,
                        "params": params,
                    }
                    if self._auth_tuple:
                        kwargs["auth"] = self._auth_tuple
                    if json_body is not None:
                        kwargs["json"] = json_body

                    response = await client.request(method.upper(), url, **kwargs)
                elapsed_ms = int((time.monotonic() - t0) * 1000)

                if response.status_code == 401:
                    # For OAuth2, try refreshing once
                    if self._credentials.strategy == ConnectorAuthStrategy.OAUTH2_CLIENT_CREDENTIALS and attempt == 0:
                        self._oauth2_token = None
                        self._oauth2_token = await _fetch_oauth2_token(self._credentials, self._config)
                        headers = {"Authorization": f"Bearer {self._oauth2_token}", **(extra_headers or {})}
                        continue
                    raise ConnectorAuthError(
                        f"Authentication rejected by {url} (HTTP 401)"
                    )

                if response.status_code in _RETRYABLE_STATUS_CODES and not skip_retry:
                    last_exc = ConnectorHTTPError(
                        f"HTTP {response.status_code} from {url}",
                        status_code=response.status_code,
                        retryable=True,
                    )
                    continue

                return response, elapsed_ms

            except ConnectorAuthError:
                raise

            except httpx.TimeoutException:
                last_exc = ConnectorTimeoutError(url, timeout)
                if skip_retry:
                    raise last_exc
                continue

            except httpx.ConnectError as exc:
                last_exc = ConnectorHTTPError(
                    f"Connection refused or DNS failure: {exc}",
                    retryable=True,
                )
                if skip_retry:
                    raise last_exc
                continue

            except httpx.HTTPStatusError as exc:
                last_exc = ConnectorHTTPError(
                    str(exc),
                    status_code=exc.response.status_code,
                    retryable=exc.response.status_code in _RETRYABLE_STATUS_CODES,
                )
                if not last_exc.retryable or skip_retry:
                    raise last_exc
                continue

        if last_exc:
            raise last_exc
        raise ConnectorHTTPError(f"Request to {url} failed after {max_retries} attempts")

    async def get(
        self,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        extra_headers: Optional[Dict[str, str]] = None,
        timeout_override: Optional[int] = None,
    ) -> Tuple[httpx.Response, int]:
        return await self.request(
            "GET", path, params=params, extra_headers=extra_headers, timeout_override=timeout_override
        )

    async def post(
        self,
        path: str,
        json_body: Optional[Dict[str, Any]] = None,
        extra_headers: Optional[Dict[str, str]] = None,
        timeout_override: Optional[int] = None,
    ) -> Tuple[httpx.Response, int]:
        return await self.request(
            "POST", path, json_body=json_body, extra_headers=extra_headers, timeout_override=timeout_override
        )
