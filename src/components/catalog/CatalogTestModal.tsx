import React, { useState, useEffect } from 'react';
import { FlaskConical, CircleCheck as CheckCircle, CircleAlert as AlertCircle, Loader, Clock, ChevronDown, ChevronUp, Save, Trash2 } from 'lucide-react';
import { ConnectorCatalogEntry, ConnectorCatalogTestResult } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { catalogApi } from '@/lib/api';
import { CatalogConnectorIcon } from './CatalogConnectorIcon';
import { useConnectorConfigStore } from '@/store/connectorConfigStore';
import { notify } from '@/store/notificationStore';

const AUTH_TYPES = [
  { value: 'none', label: 'No Auth' },
  { value: 'bearer_token', label: 'Bearer Token' },
  { value: 'basic_auth', label: 'Basic Auth' },
  { value: 'api_key_header', label: 'API Key Header' },
  { value: 'splunk_token', label: 'Splunk Token' },
  { value: 'oauth2_client_credentials', label: 'OAuth2 Client Credentials' },
];

interface CatalogTestModalProps {
  open: boolean;
  onClose: () => void;
  entry: ConnectorCatalogEntry | null;
}

export function CatalogTestModal({ open, onClose, entry }: CatalogTestModalProps) {
  const { save: saveConfig, get: getConfig, remove: removeConfig } = useConnectorConfigStore();

  const [endpointUrl, setEndpointUrl] = useState('');
  const [authType, setAuthType] = useState('none');
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyHeader, setApiKeyHeader] = useState('X-API-Key');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [tokenUrl, setTokenUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectorCatalogTestResult | null>(null);
  const [hasSaved, setHasSaved] = useState(false);

  // Load saved config when modal opens for this entry
  useEffect(() => {
    if (!open || !entry) return;
    const saved = getConfig(entry.id);
    if (saved) {
      setEndpointUrl(saved.endpointUrl);
      setAuthType(saved.authType);
      const creds = saved.credentials;
      setToken(creds.token || '');
      setUsername(creds.username || '');
      setPassword(creds.password || '');
      setApiKey(creds.api_key || '');
      setClientId(creds.client_id || '');
      setClientSecret(creds.client_secret || '');
      setTokenUrl(creds.token_url || '');
      setApiKeyHeader(saved.config.api_key_header_name || 'X-API-Key');
      setHasSaved(true);
    } else {
      setHasSaved(false);
    }
  }, [open, entry]);

  const handleClose = () => {
    setEndpointUrl('');
    setAuthType('none');
    setToken('');
    setUsername('');
    setPassword('');
    setApiKey('');
    setApiKeyHeader('X-API-Key');
    setClientId('');
    setClientSecret('');
    setTokenUrl('');
    setShowAdvanced(false);
    setResult(null);
    setHasSaved(false);
    onClose();
  };

  const handleSave = () => {
    if (!entry || !endpointUrl) return;
    saveConfig({
      catalogEntryId: entry.id,
      catalogEntryName: entry.name,
      endpointUrl,
      authType,
      config: authType === 'api_key_header' ? { api_key_header_name: apiKeyHeader } : {},
      credentials: buildCredentials(),
      savedAt: new Date().toISOString(),
    });
    setHasSaved(true);
    notify.success('Connection details saved');
  };

  const handleClearSaved = () => {
    if (!entry) return;
    removeConfig(entry.id);
    setHasSaved(false);
    notify.success('Saved connection details cleared');
  };

  const buildCredentials = () => {
    const creds: Record<string, string> = {};
    if (authType === 'bearer_token' || authType === 'splunk_token') {
      if (token) creds.token = token;
    } else if (authType === 'basic_auth') {
      if (username) creds.username = username;
      if (password) creds.password = password;
    } else if (authType === 'api_key_header') {
      if (apiKey) creds.api_key = apiKey;
    } else if (authType === 'oauth2_client_credentials') {
      if (clientId) creds.client_id = clientId;
      if (clientSecret) creds.client_secret = clientSecret;
      if (tokenUrl) creds.token_url = tokenUrl;
    }
    return creds;
  };

  const buildConfig = () => {
    const config: Record<string, string> = {};
    if (authType === 'api_key_header' && apiKeyHeader) {
      config.api_key_header_name = apiKeyHeader;
    }
    return config;
  };

  const handleTest = async () => {
    if (!entry || !endpointUrl) return;
    setTesting(true);
    setResult(null);
    try {
      const res = await catalogApi.test(entry.id, {
        endpoint_url: endpointUrl,
        auth_type: authType === 'none' ? undefined : authType,
        credentials: buildCredentials(),
        config: buildConfig(),
        timeout_seconds: 15,
      });
      setResult(res.data);
    } catch {
      setResult({ success: false, error: 'Request failed — check network or backend logs' });
    } finally {
      setTesting(false);
    }
  };

  if (!entry) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Test Connector Connectivity"
      subtitle={`Verify connection for ${entry.name}`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Close</Button>
          {hasSaved && (
            <Button
              variant="secondary"
              icon={<Trash2 className="w-4 h-4" />}
              onClick={handleClearSaved}
            >
              Clear Saved
            </Button>
          )}
          <Button
            variant="secondary"
            icon={<Save className="w-4 h-4" />}
            onClick={handleSave}
            disabled={!endpointUrl}
          >
            Save
          </Button>
          <Button
            icon={<FlaskConical className="w-4 h-4" />}
            onClick={handleTest}
            loading={testing}
            disabled={!endpointUrl}
          >
            Run Test
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Connector info */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-neutral-50 border border-neutral-100">
          <CatalogConnectorIcon icon={entry.icon} color={entry.color || '#2563EB'} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900">{entry.name}</p>
            {entry.vendor && <p className="text-xs text-neutral-400">{entry.vendor}</p>}
          </div>
          {entry.test_definition?.description !== undefined && (
            <p className="ml-auto text-xs text-neutral-400 max-w-[50%] text-right truncate">
              {String(entry.test_definition.description as string)}
            </p>
          )}
        </div>

        {hasSaved && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-100 text-xs text-green-700">
            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
            Connection details are saved locally. They will be pre-filled when you reopen this modal.
          </div>
        )}

        <Input
          label="Endpoint URL"
          placeholder="https://your-service.example.com/health"
          value={endpointUrl}
          onChange={(e) => setEndpointUrl(e.target.value)}
          required
          hint="The URL to test connectivity against"
        />

        {/* Auth configuration */}
        <div className="space-y-3">
          <Select
            label="Authentication"
            value={authType}
            onChange={(e) => setAuthType(e.target.value)}
            options={AUTH_TYPES}
          />

          {(authType === 'bearer_token' || authType === 'splunk_token') && (
            <Input
              label="Token"
              placeholder="••••••••••••"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
            />
          )}

          {authType === 'basic_auth' && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Username"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <Input
                label="Password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
              />
            </div>
          )}

          {authType === 'api_key_header' && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Header Name"
                placeholder="X-API-Key"
                value={apiKeyHeader}
                onChange={(e) => setApiKeyHeader(e.target.value)}
              />
              <Input
                label="API Key"
                placeholder="••••••••••••"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                type="password"
              />
            </div>
          )}

          {authType === 'oauth2_client_credentials' && (
            <div className="space-y-3 p-3 bg-neutral-50 rounded-xl border border-neutral-100">
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">OAuth2 Client Credentials</p>
              <Input
                label="Token URL"
                placeholder="https://auth.example.com/oauth/token"
                value={tokenUrl}
                onChange={(e) => setTokenUrl(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Client ID"
                  placeholder="your-client-id"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                />
                <Input
                  label="Client Secret"
                  placeholder="••••••••••••"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  type="password"
                />
              </div>
              <p className="text-xs text-neutral-400">
                A token will be fetched first using the client credentials flow, then used to call the endpoint URL.
              </p>
            </div>
          )}
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showAdvanced ? 'Hide' : 'Show'} advanced options
        </button>

        {showAdvanced && (
          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100 text-xs text-neutral-500 space-y-1">
            <p className="font-semibold text-neutral-600">Proxy & SSL</p>
            <p>Proxy and SSL settings are taken from the platform-level proxy configuration in Settings. Configure them there to apply to all connector tests.</p>
          </div>
        )}

        {/* Loading */}
        {testing && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-neutral-100 bg-neutral-50">
            <Loader className="w-5 h-5 animate-spin text-primary-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-neutral-700">Testing connection...</p>
              {authType !== 'none' && (
                <p className="text-xs text-neutral-400 mt-0.5">Authenticating with {AUTH_TYPES.find(a => a.value === authType)?.label}</p>
              )}
            </div>
          </div>
        )}

        {/* Result */}
        {result && !testing && (
          <div
            className={`p-4 rounded-xl border ${
              result.success
                ? 'bg-green-50 border-green-100'
                : 'bg-red-50 border-red-100'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              )}
              <span className={`text-sm font-semibold ${result.success ? 'text-green-700' : 'text-red-600'}`}>
                {result.success ? 'Connection successful' : 'Connection failed'}
              </span>
            </div>
            <div className="space-y-1 ml-7">
              {result.status_code !== undefined && (
                <p className="text-xs text-neutral-600">HTTP {result.status_code}</p>
              )}
              {result.response_time_ms !== undefined && (
                <p className="text-xs text-neutral-600 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {Math.round(result.response_time_ms)}ms response time
                </p>
              )}
              {(result.details as Record<string, unknown>)?.authenticated !== undefined && (
                <p className="text-xs text-neutral-500">
                  Auth: {(result.details as Record<string, unknown>).authenticated ? 'credentials sent' : 'no credentials'}
                </p>
              )}
              {result.error && (
                <p className="text-xs text-red-500 mt-1">{result.error}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
