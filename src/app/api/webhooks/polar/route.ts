import { withApi } from "@/lib/http/api";
import { unavailableBilling } from "@/modules/billing/availability";
export const POST = withApi(async () => unavailableBilling());
