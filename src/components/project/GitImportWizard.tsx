import React, { useState, useCallback } from 'react';
import { GitBranch, ChevronRight, Loader as Loader2, Check, CircleAlert as AlertCircle, X, ArrowLeft, Plug } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { projectApi, catalogApi } from '@/lib/api';
import { notify } from '@/store/notificationStore';
import { ConnectorCatalogEntry } from '@/types';
import { cn } from '@/lib/utils';

interface GitProject {
  id?: string;
  name: string;
  description?: string;
  path?: string;
  web_url?: string;
}

interface ProjectImportItem {
  gitProject: GitProject;
  selected: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  teamId: string;
  lobId: string;
}

type Step = 'git-details' | 'select-projects' | 'assign-connectors' | 'importing';

export function GitImportWizard({ open, onClose, onImported, teamId, lobId }: Props) {
  const [step, setStep] = useState<Step>('git-details');
  const [gitUrl, setGitUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [items, setItems] = useState<ProjectImportItem[]>([]);
  const [catalogEntries, setCatalogEntries] = useState<ConnectorCatalogEntry[]>([]);
  const [selectedConnectorIds, setSelectedConnectorIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: number } | null>(null);

  const resetAndClose = () => {
    setStep('git-details');
    setGitUrl('');
    setAccessToken('');
    setFetchError('');
    setItems([]);
    setSelectedConnectorIds(new Set());
    setImportResult(null);
    onClose();
  };

  const fetchProjects = async () => {
    if (!gitUrl.trim()) return;
    setFetching(true);
    setFetchError('');
    try {
      const res = await projectApi.gitImportFetch({ git_url: gitUrl.trim(), access_token: accessToken || undefined });
      const data = res.data as { projects: GitProject[]; total: number };
      if (data.projects.length === 0) {
        setFetchError('No projects found at this URL. Make sure the API returns an array with a "name" field.');
        return;
      }
      setItems(data.projects.map(p => ({ gitProject: p, selected: false })));
      const catRes = await catalogApi.list({ enabled_only: true });
      setCatalogEntries(catRes.data as ConnectorCatalogEntry[]);
      setStep('select-projects');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setFetchError(msg || 'Failed to fetch projects from the Git URL.');
    } finally {
      setFetching(false);
    }
  };

  const toggleProject = (idx: number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item));
  };

  const selectAll = () => setItems(prev => prev.map(item => ({ ...item, selected: true })));
  const selectNone = () => setItems(prev => prev.map(item => ({ ...item, selected: false })));

  const toggleConnector = useCallback((entryId: string) => {
    setSelectedConnectorIds(prev => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }, []);

  const selectAllConnectors = () => setSelectedConnectorIds(new Set(catalogEntries.map(e => e.id)));
  const clearConnectors = () => setSelectedConnectorIds(new Set());

  const handleImport = async () => {
    const toImport = items.filter(i => i.selected);
    if (toImport.length === 0) {
      notify.error('Select at least one project to import');
      return;
    }
    setImporting(true);
    setStep('importing');
    const connectors = catalogEntries
      .filter(e => selectedConnectorIds.has(e.id))
      .map(e => ({ catalog_entry_id: e.id, name: e.name }));
    try {
      const res = await projectApi.gitImportBatch({
        lob_id: lobId,
        team_id: teamId,
        projects: toImport.map(item => ({
          name: item.gitProject.name,
          description: item.gitProject.description,
          connectors,
        })),
      });
      const data = res.data as { total_created: number; total_errors: number };
      setImportResult({ created: data.total_created, errors: data.total_errors });
      if (data.total_created > 0) {
        notify.success(`Imported ${data.total_created} project${data.total_created !== 1 ? 's' : ''} — linked to this team`);
        onImported();
      }
      if (data.total_errors > 0) {
        notify.error(`${data.total_errors} project${data.total_errors !== 1 ? 's' : ''} failed to import`);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      notify.error('Import failed', msg);
      setStep('assign-connectors');
    } finally {
      setImporting(false);
    }
  };

  const selectedCount = items.filter(i => i.selected).length;

  const stepTitles: Record<Step, string> = {
    'git-details': 'Git Import',
    'select-projects': 'Select Projects',
    'assign-connectors': 'Assign Connectors',
    'importing': 'Importing',
  };

  const stepSubtitles: Record<Step, string> = {
    'git-details': 'Connect to a Git server to import projects',
    'select-projects': `${items.length} project${items.length !== 1 ? 's' : ''} found — select which to import`,
    'assign-connectors': `Choose connectors to assign to all ${selectedCount} selected project${selectedCount !== 1 ? 's' : ''}`,
    'importing': 'Creating projects in the system...',
  };

  const footerContent = () => {
    if (step === 'git-details') return (
      <>
        <Button variant="secondary" onClick={resetAndClose}>Cancel</Button>
        <Button onClick={fetchProjects} loading={fetching} disabled={!gitUrl.trim()}>
          Fetch Projects
        </Button>
      </>
    );
    if (step === 'select-projects') return (
      <>
        <Button variant="secondary" onClick={() => setStep('git-details')}>
          <ArrowLeft className="w-4 h-4 mr-1.5" />Back
        </Button>
        <Button onClick={() => setStep('assign-connectors')} disabled={selectedCount === 0}>
          Next: Assign Connectors
          <ChevronRight className="w-4 h-4 ml-1.5" />
        </Button>
      </>
    );
    if (step === 'assign-connectors') return (
      <>
        <Button variant="secondary" onClick={() => setStep('select-projects')}>
          <ArrowLeft className="w-4 h-4 mr-1.5" />Back
        </Button>
        <Button onClick={handleImport} loading={importing}>
          Import {selectedCount} Project{selectedCount !== 1 ? 's' : ''}
          {selectedConnectorIds.size > 0 && ` with ${selectedConnectorIds.size} connector${selectedConnectorIds.size !== 1 ? 's' : ''}`}
        </Button>
      </>
    );
    if (step === 'importing') return (
      <Button onClick={resetAndClose} disabled={importing}>Close</Button>
    );
    return null;
  };

  return (
    <Modal
      open={open}
      onClose={resetAndClose}
      title={stepTitles[step]}
      subtitle={stepSubtitles[step]}
      size="lg"
      footer={footerContent()}
    >
      <AnimatePresence mode="wait">
        {step === 'git-details' && (
          <motion.div
            key="git-details"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            className="space-y-5"
          >
            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <GitBranch className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <div className="text-xs text-blue-700">
                <p className="font-semibold">How it works</p>
                <p className="mt-0.5">Enter the API URL of your Git server. All imported projects will automatically be linked to this team.</p>
              </div>
            </div>

            <Input
              id="git-url-input"
              label="Git API URL"
              placeholder="https://gitlab.example.com/api/v4/groups/42/projects"
              value={gitUrl}
              onChange={e => setGitUrl(e.target.value)}
              hint="URL that returns a JSON array/object of projects/repos"
              required
            />

            <Input
              id="git-token-input"
              label="Access Token (optional)"
              placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
              value={accessToken}
              onChange={e => setAccessToken(e.target.value)}
              hint="Bearer token or Personal Access Token for private repositories"
              type="password"
            />

            {fetchError && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-100">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{fetchError}</p>
              </div>
            )}
          </motion.div>
        )}

        {step === 'select-projects' && (
          <motion.div
            key="select-projects"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-neutral-500">{selectedCount} selected</p>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Select All</button>
                <span className="text-neutral-300">|</span>
                <button onClick={selectNone} className="text-xs text-neutral-500 hover:text-neutral-700 font-medium">None</button>
              </div>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {items.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleProject(idx)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all',
                    item.selected
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-neutral-100 bg-white hover:border-neutral-200 hover:bg-neutral-50'
                  )}
                >
                  <div className={cn(
                    'w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all',
                    item.selected ? 'border-blue-500 bg-blue-500' : 'border-neutral-300'
                  )}>
                    {item.selected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 truncate">{item.gitProject.name}</p>
                    {item.gitProject.description && (
                      <p className="text-xs text-neutral-400 truncate mt-0.5">{item.gitProject.description}</p>
                    )}
                    {item.gitProject.path && (
                      <p className="text-[10px] font-mono text-neutral-400 mt-0.5 truncate">{item.gitProject.path}</p>
                    )}
                  </div>
                  {item.selected && (
                    <Check className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'assign-connectors' && (
          <motion.div
            key="assign-connectors"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            className="space-y-4"
          >
            {/* Info banner */}
            <div className="flex items-start gap-3 p-3.5 bg-blue-50 rounded-xl border border-blue-100">
              <Plug className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-blue-700">
                <p className="font-semibold">Bulk connector assignment</p>
                <p className="mt-0.5">Selected connectors will be assigned to all {selectedCount} project{selectedCount !== 1 ? 's' : ''}. You can adjust per-project later.</p>
              </div>
            </div>

            {/* Selected projects summary */}
            <div className="flex flex-wrap gap-1.5">
              {items.filter(i => i.selected).map((item, idx) => (
                <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700">
                  <GitBranch className="w-3 h-3 text-neutral-400" />
                  {item.gitProject.name}
                </span>
              ))}
            </div>

            {/* Connector selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-neutral-700">
                  Available Connectors
                  {selectedConnectorIds.size > 0 && (
                    <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                      {selectedConnectorIds.size} selected
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  <button onClick={selectAllConnectors} className="text-xs text-blue-600 hover:text-blue-800 font-medium">All</button>
                  <span className="text-neutral-300">|</span>
                  <button onClick={clearConnectors} className="text-xs text-neutral-500 hover:text-neutral-700 font-medium">None</button>
                </div>
              </div>

              {catalogEntries.length === 0 ? (
                <div className="text-center py-6 text-sm text-neutral-400">
                  No connectors available in catalog. You can add connectors to projects later.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                  {catalogEntries.map(entry => {
                    const isSelected = selectedConnectorIds.has(entry.id);
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => toggleConnector(entry.id)}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-xl border text-left transition-all group',
                          isSelected
                            ? 'border-blue-300 bg-blue-50 shadow-sm'
                            : 'border-neutral-200 bg-white hover:border-blue-200 hover:bg-neutral-50'
                        )}
                      >
                        <div
                          className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all text-xs font-bold text-white',
                          )}
                          style={{ background: isSelected ? (entry.color || '#2563EB') : (entry.color || '#2563EB') + '30' }}
                        >
                          <span style={{ color: isSelected ? 'white' : (entry.color || '#2563EB') }}>
                            {entry.name.slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-neutral-800 truncate">{entry.name}</p>
                          {entry.category && (
                            <p className="text-[10px] text-neutral-400 capitalize truncate">{entry.category}</p>
                          )}
                        </div>
                        <div className={cn(
                          'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all',
                          isSelected ? 'border-blue-500 bg-blue-500' : 'border-neutral-300'
                        )}>
                          {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-xs text-neutral-400 text-center">
              You can skip connector assignment and add them later from each project.
            </p>
          </motion.div>
        )}

        {step === 'importing' && (
          <motion.div
            key="importing"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-10 gap-4"
          >
            {importing ? (
              <>
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                <div className="text-center">
                  <p className="text-sm font-semibold text-neutral-900">Importing projects...</p>
                  <p className="text-xs text-neutral-500 mt-1">Creating {selectedCount} project{selectedCount !== 1 ? 's' : ''} and linking to this team</p>
                </div>
              </>
            ) : importResult ? (
              <>
                <div className={cn(
                  'w-14 h-14 rounded-full flex items-center justify-center',
                  importResult.created > 0 ? 'bg-green-100' : 'bg-red-100'
                )}>
                  {importResult.created > 0
                    ? <Check className="w-7 h-7 text-green-600" />
                    : <X className="w-7 h-7 text-red-500" />
                  }
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-neutral-900">Import Complete</p>
                  <div className="flex items-center gap-4 mt-2 justify-center">
                    {importResult.created > 0 && (
                      <span className="text-xs font-medium text-green-600">{importResult.created} created &amp; linked to team</span>
                    )}
                    {importResult.errors > 0 && (
                      <span className="text-xs font-medium text-red-500">{importResult.errors} failed</span>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
