import { listPayments } from "@/modules/admin/dashboard";
import { adminMetadata, authorizeAdmin } from "../authorize";
import { PaymentCatalogPanel } from "../payment-catalog-panel";
import { Empty, formatDateTime, formatMoney, PageHeader, Pagination, Panel, Pill, TableFrame, td, th, type Tone } from "../_components/ui";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetadata("Payment administration");

type Props = { searchParams: Promise<{ page?: string }> };
const statusTone: Record<string, Tone> = { succeeded: "green", pending: "orange", failed: "red", refunded: "neutral", disputed: "red" };

export default async function AdminPaymentsPage({ searchParams }: Props) {
  const actor = await authorizeAdmin();
  const payments = await listPayments(actor, { page: (await searchParams).page });

  return <>
    <PageHeader title="Payments" description="The provider-confirmed payment ledger and the Dodo product catalog. Financial records are read-only here." />
    <Panel title="Payment ledger" description="Confirmed by Dodo webhooks, newest first.">
      {payments.rows.length ? <TableFrame label="Payment ledger table">
        <table className="w-full min-w-[720px] border-collapse"><caption className="sr-only">Payment ledger</caption>
          <thead><tr className="border-b border-border"><th scope="col" className={th}>Customer</th><th scope="col" className={th}>Product</th><th scope="col" className={th}>Amount</th>
            <th scope="col" className={th}>Status</th><th scope="col" className={th}>Date</th></tr></thead>
          <tbody>{payments.rows.map((payment) => <tr key={payment.id} className="border-b border-border last:border-0 hover:bg-bg-card-hover">
            <td className={`${td} font-semibold`}>{payment.userName ?? <span className="font-normal text-text-secondary">Removed account</span>}</td>
            <td className={td}>{payment.product ?? "Retired product"}{payment.siteSlug && <span className="ml-2 font-mono text-[0.72rem] text-text-secondary">{payment.siteSlug}</span>}</td>
            <td className={`${td} whitespace-nowrap font-mono`}>{formatMoney(payment.amountCents, payment.currency)}{payment.recurring && <span className="ml-2 font-body text-[0.72rem] text-text-secondary">recurring</span>}</td>
            <td className={td}><Pill tone={statusTone[payment.status] ?? "neutral"}>{payment.status}</Pill></td>
            <td className={`${td} whitespace-nowrap text-text-secondary`}>{formatDateTime(payment.occurredAt)}</td>
          </tr>)}</tbody>
        </table>
      </TableFrame> : <Empty>No payments have been recorded yet.</Empty>}
      <Pagination path="/admin/payments" page={payments.page} pages={payments.pages} total={payments.total} params={{}} noun="payment" />
    </Panel>
    <PaymentCatalogPanel />
  </>;
}
