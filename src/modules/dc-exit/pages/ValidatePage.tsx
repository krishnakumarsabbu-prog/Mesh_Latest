/**
 * Enterprise Digital Twin - DC Exit module.
 *
 * Validate step page. Placeholder - title only, no business logic yet.
 */

import { PageHeader } from '@/components/ui/PageHeader';

export function ValidatePage() {
  return (
    <div className="p-6">
      <PageHeader title="Validate" subtitle="Confirm cutover success, health, and post-exit compliance." />
    </div>
  );
}
