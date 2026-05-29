from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import uuid
import re
import httpx
from app.db.base import get_db
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectMemberCreate, ProjectMemberUpdate
from app.schemas.project_connector import ProjectConnectorAssign
from app.services.project_service import project_service
from app.services.project_connector_service import project_connector_service
from app.services.audit_service import audit_service
from app.api.deps import get_current_user, require_roles
from app.models.user import User, UserRole
from app.models.project_connector import ProjectConnector, ProjectConnectorStatus
from app.models.project_dashboard_assignment import ProjectDashboardAssignment

router = APIRouter(prefix="/projects", tags=["projects"])

LOB_ADMIN_ROLES = {UserRole.SUPER_ADMIN, UserRole.LOB_ADMIN, UserRole.ADMIN}
PROJECT_MANAGE_ROLES = {UserRole.SUPER_ADMIN, UserRole.LOB_ADMIN, UserRole.PROJECT_ADMIN, UserRole.ADMIN}

# Route-level guards applied via dependencies=
_project_delete_guard = [Depends(require_roles(["super_admin", "admin", "project_admin"]))]


@router.get("", response_model=List[dict])
async def list_projects(
    lob_id: Optional[str] = Query(None),
    team_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await project_service.get_all(
        db,
        lob_id=lob_id,
        team_id=team_id,
        user_id=current_user.id,
        user_role=current_user.role.value
    )


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in LOB_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only LOB Admins can create projects")
    try:
        project = await project_service.create(db, data, current_user.id)
        d = await project_service.get_by_id_with_counts(db, project.id)
        await audit_service.log(
            db, action="project.create", resource_type="project", resource_id=project.id,
            user_id=current_user.id, tenant_id=current_user.tenant_id,
            ip_address=request.client.host if request.client else None,
            changes={"name": project.name, "lob_id": project.lob_id, "team_id": project.team_id},
        )
        return d
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{project_id}", response_model=dict)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = await project_service.get_by_id_with_counts(db, project_id)
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if current_user.role in (UserRole.PROJECT_ADMIN, UserRole.PROJECT_USER):
        if not await project_service.is_member(db, project_id, current_user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return data


@router.patch("/{project_id}", response_model=dict)
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in PROJECT_MANAGE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    if current_user.role == UserRole.PROJECT_ADMIN:
        if not await project_service.is_member(db, project_id, current_user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    project = await project_service.update(db, project_id, data)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    d = {**project.__dict__}
    d.pop("_sa_instance_state", None)
    await audit_service.log(
        db, action="project.update", resource_type="project", resource_id=project_id,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
        changes=data.model_dump(exclude_none=True),
    )
    return d


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None, dependencies=_project_delete_guard)
async def delete_project(
    project_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in LOB_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only LOB Admins can delete projects")
    if not await project_service.delete(db, project_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    await audit_service.log(
        db, action="project.delete", resource_type="project", resource_id=project_id,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
    )


@router.get("/{project_id}/members", response_model=List[dict])
async def list_members(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role in (UserRole.PROJECT_ADMIN, UserRole.PROJECT_USER):
        if not await project_service.is_member(db, project_id, current_user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return await project_service.get_members(db, project_id)


@router.post("/{project_id}/members", response_model=dict, status_code=status.HTTP_201_CREATED)
async def add_member(
    project_id: str,
    data: ProjectMemberCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in PROJECT_MANAGE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    if current_user.role == UserRole.PROJECT_ADMIN:
        if not await project_service.is_member(db, project_id, current_user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    try:
        return await project_service.add_member(db, project_id, data, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@router.patch("/{project_id}/members/{member_id}", response_model=dict)
async def update_member(
    project_id: str,
    member_id: str,
    data: ProjectMemberUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in PROJECT_MANAGE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    result = await project_service.update_member(db, project_id, member_id, data)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    return result


@router.delete("/{project_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_member(
    project_id: str,
    member_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in PROJECT_MANAGE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    if not await project_service.remove_member(db, project_id, member_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")


# ─── Git-Enabled Registration ─────────────────────────────────────────────────

CONNECTOR_SIGNATURES: Dict[str, List[str]] = {
    "mongodb":     [r"spring\.data\.mongodb", r"MONGO_URI", r"mongodb://"],
    "appdynamics": [r"appdynamics\.agent", r"AD_CONTROLLER", r"appdynamics\.controller"],
    "splunk":      [r"splunk\.url", r"splunk\.token", r"SPLUNK_HEC"],
    "ibm-mq":      [r"ibm\.mq", r"spring\.jms", r"MQ_HOST"],
    "openshift":   [r"openshift\.", r"OCP_", r"KUBE_"],
    "oracle-oem":  [r"oracle\.jdbc", r"spring\.datasource\.url=jdbc:oracle"],
    "grafana":     [r"grafana\.url", r"GF_"],
    "servicenow":  [r"servicenow\.", r"SNOW_"],
}

CONFIG_FILE_NAMES = {
    "application.properties", "application.yml", "application.yaml",
    ".env.example", ".env.sample", "config.yaml", "config.yml",
    "docker-compose.yml", "docker-compose.yaml",
}


class GitScanRequest(BaseModel):
    repository_url: str
    branch: str = "main"
    access_token: Optional[str] = None


class GitScanResponse(BaseModel):
    detected_connectors: List[str]
    config_files_scanned: List[str]
    scan_summary: Dict[str, Any]


class ConnectorRegistrationItem(BaseModel):
    catalog_entry_id: str
    name: str
    config: Optional[Dict[str, Any]] = None


class ProjectRegisterRequest(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    lob_id: str
    team_id: Optional[str] = None
    environment: str = "production"
    color: str = "#30D158"
    connectors: List[ConnectorRegistrationItem] = []
    dashboard_template_id: Optional[str] = None


def _parse_github_url(repo_url: str):
    """Extract owner/repo from common GitHub URL formats."""
    patterns = [
        r"github\.com[:/]([^/]+)/([^/\s\.]+?)(?:\.git)?$",
        r"github\.com/([^/]+)/([^/\s\.]+)",
    ]
    for p in patterns:
        m = re.search(p, repo_url)
        if m:
            return m.group(1), m.group(2)
    return None, None


def _parse_gitlab_url(repo_url: str):
    """Extract owner/repo from GitLab URL formats."""
    m = re.search(r"gitlab\.com[:/](.+?)(?:\.git)?$", repo_url)
    if m:
        parts = m.group(1).split("/")
        if len(parts) >= 2:
            return "/".join(parts[:-1]), parts[-1]
    return None, None


async def _fetch_github_tree(owner: str, repo: str, branch: str, token: Optional[str]) -> List[Dict]:
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"token {token}"
    url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url, headers=headers)
        if r.status_code != 200:
            return []
        data = r.json()
        return data.get("tree", [])


async def _fetch_file_content(url: str, token: Optional[str]) -> Optional[str]:
    headers = {"Accept": "application/vnd.github.v3.raw"}
    if token:
        headers["Authorization"] = f"token {token}"
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(url, headers=headers)
            if r.status_code == 200:
                return r.text
        except Exception:
            pass
    return None


def _detect_connectors_in_content(content: str) -> List[str]:
    found = []
    for connector_key, patterns in CONNECTOR_SIGNATURES.items():
        for pattern in patterns:
            if re.search(pattern, content, re.IGNORECASE):
                if connector_key not in found:
                    found.append(connector_key)
                break
    return found


@router.post("/git-scan", response_model=GitScanResponse)
async def git_scan(
    request_body: GitScanRequest,
    current_user: User = Depends(get_current_user),
):
    repo_url = request_body.repository_url.strip()
    branch = request_body.branch or "main"
    token = request_body.access_token

    owner, repo = _parse_github_url(repo_url)
    is_gitlab = False
    if not owner:
        owner, repo = _parse_gitlab_url(repo_url)
        is_gitlab = True

    if not owner or not repo:
        return GitScanResponse(
            detected_connectors=[],
            config_files_scanned=[],
            scan_summary={"error": "Could not parse repository URL. Supports GitHub and GitLab."},
        )

    scanned_files: List[str] = []
    all_detected: List[str] = []

    try:
        if not is_gitlab:
            tree = await _fetch_github_tree(owner, repo, branch, token)
            config_blobs = [
                item for item in tree
                if item.get("type") == "blob"
                and any(item.get("path", "").endswith(name) for name in CONFIG_FILE_NAMES)
            ][:10]

            for blob in config_blobs:
                file_path = blob.get("path", "")
                raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{file_path}"
                content = await _fetch_file_content(raw_url, token)
                if content:
                    scanned_files.append(file_path)
                    detected = _detect_connectors_in_content(content)
                    for d in detected:
                        if d not in all_detected:
                            all_detected.append(d)
        else:
            # GitLab: use the Files API
            encoded_repo = f"{owner}/{repo}".replace("/", "%2F")
            async with httpx.AsyncClient(timeout=15) as client:
                headers = {}
                if token:
                    headers["PRIVATE-TOKEN"] = token
                r = await client.get(
                    f"https://gitlab.com/api/v4/projects/{encoded_repo}/repository/tree?recursive=true&per_page=100&ref={branch}",
                    headers=headers,
                )
                if r.status_code == 200:
                    items = r.json()
                    for item in items:
                        if item.get("type") == "blob" and any(
                            item.get("name", "") == n for n in CONFIG_FILE_NAMES
                        ):
                            fp = item.get("path", "")
                            encoded_fp = fp.replace("/", "%2F")
                            fr = await client.get(
                                f"https://gitlab.com/api/v4/projects/{encoded_repo}/repository/files/{encoded_fp}/raw?ref={branch}",
                                headers=headers,
                            )
                            if fr.status_code == 200:
                                scanned_files.append(fp)
                                detected = _detect_connectors_in_content(fr.text)
                                for d in detected:
                                    if d not in all_detected:
                                        all_detected.append(d)

    except Exception as e:
        return GitScanResponse(
            detected_connectors=[],
            config_files_scanned=[],
            scan_summary={"error": str(e)},
        )

    return GitScanResponse(
        detected_connectors=all_detected,
        config_files_scanned=scanned_files,
        scan_summary={
            "repository": f"{owner}/{repo}",
            "branch": branch,
            "files_scanned": len(scanned_files),
            "connectors_found": len(all_detected),
        },
    )


@router.post("/register", response_model=dict, status_code=status.HTTP_201_CREATED)
async def register_project(
    request_body: ProjectRegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in LOB_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only LOB Admins can register projects")

    try:
        # 1. Create project
        project_data = ProjectCreate(
            name=request_body.name,
            slug=request_body.slug,
            description=request_body.description,
            lob_id=request_body.lob_id,
            team_id=request_body.team_id,
            environment=request_body.environment,
            color=request_body.color,
        )
        project = await project_service.create(db, project_data, current_user.id)

        # 2. Assign connectors
        assigned_connectors = []
        for conn_item in request_body.connectors:
            try:
                assign_data = ProjectConnectorAssign(
                    catalog_entry_id=conn_item.catalog_entry_id,
                    name=conn_item.name,
                    priority=0,
                )
                pc = await project_connector_service.assign(db, project.id, assign_data, current_user.id)
                if conn_item.config:
                    from app.schemas.project_connector import ProjectConnectorConfig
                    cfg = ProjectConnectorConfig(config=conn_item.config)
                    await project_connector_service.configure(db, pc.id, cfg)
                assigned_connectors.append(pc.id)
            except Exception:
                pass

        # 3. Assign dashboard template if provided
        dashboard_assignment_id = None
        if request_body.dashboard_template_id:
            try:
                from app.schemas.project_dashboard_assignment import AssignmentCreate
                from app.services.project_dashboard_assignment_service import project_dashboard_assignment_service
                assignment = await project_dashboard_assignment_service.assign_template(
                    db,
                    project_id=project.id,
                    data=AssignmentCreate(
                        template_id=request_body.dashboard_template_id,
                        is_default=True,
                    ),
                    user_id=current_user.id,
                )
                dashboard_assignment_id = assignment.id if assignment else None
            except Exception:
                pass

        # 4. Audit log
        await audit_service.log(
            db,
            action="project.register",
            resource_type="project",
            resource_id=project.id,
            user_id=current_user.id,
            tenant_id=current_user.tenant_id,
            ip_address=request.client.host if request.client else None,
            changes={
                "name": project.name,
                "lob_id": project.lob_id,
                "team_id": project.team_id,
                "environment": project.environment,
                "connectors_assigned": len(assigned_connectors),
                "dashboard_template_id": request_body.dashboard_template_id,
            },
        )

        enriched = await project_service.get_by_id_with_counts(db, project.id)
        return {
            "project_id": project.id,
            "status": "registered",
            "connectors_assigned": len(assigned_connectors),
            "dashboard_assignment_id": dashboard_assignment_id,
            "project": enriched,
        }

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ─── Git Import ───────────────────────────────────────────────────────────────

class GitImportFetchRequest(BaseModel):
    git_url: str
    access_token: Optional[str] = None


class GitImportProject(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    path: Optional[str] = None
    web_url: Optional[str] = None


class GitImportFetchResponse(BaseModel):
    projects: List[GitImportProject]
    source: str
    total: int


class GitImportConnector(BaseModel):
    catalog_entry_id: str
    name: str


class GitImportBatchItem(BaseModel):
    name: str
    description: Optional[str] = None
    connectors: List[GitImportConnector] = []


class GitImportBatchRequest(BaseModel):
    lob_id: str
    team_id: str
    environment: str = "production"
    projects: List[GitImportBatchItem]


@router.post("/git-import/fetch", response_model=GitImportFetchResponse)
async def git_import_fetch(
    body: GitImportFetchRequest,
    current_user: User = Depends(get_current_user),
):
    """Fetch projects/repos from a generic Git API URL."""
    git_url = body.git_url.strip().rstrip("/")
    headers = {}
    if body.access_token:
        headers["Authorization"] = f"Bearer {body.access_token}"
        headers["PRIVATE-TOKEN"] = body.access_token

    try:
        async with httpx.AsyncClient(timeout=15, verify=False) as client:
            r = await client.get(git_url, headers=headers)
            if r.status_code not in (200, 201):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Git API returned status {r.status_code}: {r.text[:300]}"
                )
            data = r.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Connection failed: {str(e)}")

    # Normalise: accept list or dict with items/data/projects/repositories keys
    items: List[Dict] = []
    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        for key in ("items", "data", "projects", "repositories", "results", "values"):
            if key in data and isinstance(data[key], list):
                items = data[key]
                break
        if not items and "name" in data:
            items = [data]

    projects: List[GitImportProject] = []
    for item in items:
        name = item.get("name") or item.get("path") or item.get("slug") or item.get("key")
        if not name:
            continue
        projects.append(GitImportProject(
            id=str(item.get("id", "")),
            name=name,
            description=item.get("description") or item.get("desc"),
            path=item.get("path_with_namespace") or item.get("path") or item.get("full_name"),
            web_url=item.get("web_url") or item.get("html_url") or item.get("links", {}).get("self"),
        ))

    return GitImportFetchResponse(projects=projects, source=git_url, total=len(projects))


@router.post("/git-import/batch", response_model=dict, status_code=status.HTTP_201_CREATED)
async def git_import_batch(
    request_body: GitImportBatchRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Batch-create projects from a Git import, assigning connectors to each."""
    if current_user.role not in LOB_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only LOB Admins can import projects")

    created = []
    errors = []

    for item in request_body.projects:
        try:
            slug = re.sub(r"[^a-z0-9-]", "-", item.name.lower()).strip("-") or "project"
            slug = f"{slug}-{str(uuid.uuid4())[:6]}"
            project_data = ProjectCreate(
                name=item.name,
                slug=slug,
                description=item.description,
                lob_id=request_body.lob_id,
                team_id=request_body.team_id,
                environment=request_body.environment,
                color="#30D158",
            )
            project = await project_service.create(db, project_data, current_user.id)

            assigned = []
            for conn in item.connectors:
                try:
                    assign_data = ProjectConnectorAssign(
                        catalog_entry_id=conn.catalog_entry_id,
                        name=conn.name,
                        priority=0,
                    )
                    pc = await project_connector_service.assign(db, project.id, assign_data, current_user.id)
                    assigned.append(pc.id)
                except Exception:
                    pass

            await audit_service.log(
                db, action="project.git_import", resource_type="project", resource_id=project.id,
                user_id=current_user.id, tenant_id=current_user.tenant_id,
                ip_address=request.client.host if request.client else None,
                changes={"name": project.name, "source": "git_import", "connectors": len(assigned)},
            )
            created.append({"project_id": project.id, "name": project.name, "connectors_assigned": len(assigned)})
        except Exception as e:
            errors.append({"name": item.name, "error": str(e)})

    return {"created": created, "errors": errors, "total_created": len(created), "total_errors": len(errors)}
