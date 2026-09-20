import { authorizeAdmin, adminMetadata } from "../authorize";
import { PageHeader, Panel, Empty } from "../_components/ui";
import { listManagedRedirects } from "@/modules/redirects/admin";
import { RedirectsPanel } from "./redirects-panel";
export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetadata("URL redirects");
export default async function RedirectsPage() {
  const data = await listManagedRedirects(await authorizeAdmin());
  return <>
    <PageHeader title="URL redirects" description="Keep old links working when a public page moves. Preview each change before saving." />
    <RedirectsPanel rules={data.rules.map(rule => ({ id: rule.id, sourcePath: rule.sourcePath, destinationPath: rule.destinationPath,
      statusCode: rule.statusCode, enabled: rule.enabled, version: rule.version }))} />
    <Panel title="Founder address history" description="Profile aliases resolve directly to the current username. Visibility and ownership protections always apply." className="mt-5">
      {data.aliases.length ? <ul className="divide-y divide-border">{data.aliases.map(alias => <li key={alias.oldUsername} className="flex flex-wrap gap-2 px-5 py-3 text-sm">
        <span className="break-all text-text-secondary">/founder/{alias.oldUsername}</span><span aria-hidden="true">→</span>
        <span className="break-all">/founder/{alias.username}</span><span className="text-text-secondary">301 · {alias.visibility}</span>
      </li>)}</ul> : <Empty>No previous founder usernames yet.</Empty>}
      <p className="border-t border-border p-5 text-xs text-text-secondary">Old /profile/account-ID and /founders/username addresses also redirect automatically. Account owners manage their username from My Profile; these protected routes cannot be overridden by a general redirect.</p>
    </Panel>
  </>;
}

