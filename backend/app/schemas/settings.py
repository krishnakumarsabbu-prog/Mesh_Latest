from __future__ import annotations
from typing import Any, List, Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr


class NotificationPreferencesUpdate(BaseModel):
    email_notifications: Optional[bool] = None
    in_app_notifications: Optional[bool] = None
    alert_severity_info: Optional[bool] = None
    alert_severity_warning: Optional[bool] = None
    alert_severity_critical: Optional[bool] = None
    digest_frequency: Optional[str] = None
    quiet_hours_enabled: Optional[bool] = None
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None
    dashboard_alert_subscriptions: Optional[List[str]] = None
    notification_channels: Optional[List[dict]] = None


class AppearanceSettingsUpdate(BaseModel):
    theme: Optional[str] = None
    default_dashboard_layout: Optional[str] = None
    density: Optional[str] = None
    chart_animations: Optional[bool] = None
    sidebar_collapsed: Optional[bool] = None
    default_landing_page: Optional[str] = None
    table_row_density: Optional[str] = None


class UserSettingsResponse(BaseModel):
    id: str
    user_id: str
    email_notifications: bool
    in_app_notifications: bool
    alert_severity_info: bool
    alert_severity_warning: bool
    alert_severity_critical: bool
    digest_frequency: str
    quiet_hours_enabled: bool
    quiet_hours_start: str
    quiet_hours_end: str
    dashboard_alert_subscriptions: List[Any]
    notification_channels: List[Any]
    theme: str
    default_dashboard_layout: str
    density: str
    chart_animations: bool
    sidebar_collapsed: bool
    default_landing_page: str
    table_row_density: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    avatar_url: Optional[str] = None


class UserSessionResponse(BaseModel):
    id: str
    device_info: Optional[str]
    ip_address: Optional[str]
    user_agent: Optional[str]
    last_active: datetime
    created_at: datetime
    is_active: bool
    is_current: bool = False

    class Config:
        from_attributes = True


class IntegrationCreate(BaseModel):
    name: str
    integration_type: str
    description: Optional[str] = None
    config: dict = {}
    secrets: dict = {}
    is_enabled: bool = True


class IntegrationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[dict] = None
    secrets: Optional[dict] = None
    is_enabled: Optional[bool] = None


class IntegrationResponse(BaseModel):
    id: str
    name: str
    integration_type: str
    status: str
    description: Optional[str]
    config: dict
    is_enabled: bool
    last_tested_at: Optional[datetime]
    last_test_result: Optional[dict]
    created_at: datetime
    updated_at: datetime
    tenant_id: str

    class Config:
        from_attributes = True


class IntegrationTestResult(BaseModel):
    success: bool
    message: str
    details: Optional[dict] = None
    tested_at: datetime
