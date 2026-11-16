/**
 * Runnable samples of real Transynq flows.
 *
 * Configure with environment variables (never hard-code secrets):
 *   TRANSYNQ_BASE_URL   e.g. https://api.example.com
 *   TRANSYNQ_API_KEY    an API client key, or
 *   TRANSYNQ_USER / TRANSYNQ_PASSWORD   a user for session sign-in
 *
 * Run (after `npm run build`): node --experimental-strip-types examples/flows.ts <flow> [args]   (Node >= 22.6), or compile with tsc.
 * Flows: sign-in | page-grid | create-booking | update-holiday | list-invoices | upload-pod | long-operation
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  ApiKeyCredential,
  FileUpload,
  LongOperationFailedError,
  SessionCredential,
  TransynqClient,
  newId,
  readModifyWrite,
  type BookingRequestDto,
  type Credential,
  type GridQueryRequest,
} from '../src/index.js';

function credential(): Credential {
  const key = process.env['TRANSYNQ_API_KEY'];
  if (key) return new ApiKeyCredential(key);
  return new SessionCredential(process.env['TRANSYNQ_USER'] ?? 'user@example.com', process.env['TRANSYNQ_PASSWORD'] ?? 'change-me');
}

export function createClient(): TransynqClient {
  return new TransynqClient({
    baseUrl: process.env['TRANSYNQ_BASE_URL'] ?? 'https://api.example.com',
    credential: credential(),
    userAgentSuffix: 'transynq-examples/1.0',
  });
}

/** Sign in (session or API key) and show who the client acts as. */
export async function signIn(client: TransynqClient): Promise<void> {
  if (client.options.credential instanceof SessionCredential) {
    const me = await client.authentication.getMe();
    const profile = me.data.json<{ userName: string; companyName: string }>();
    console.log(`Signed in as ${profile.userName} of ${profile.companyName} (API ${me.apiVersion}).`);
    await client.signOut();
  } else {
    const apiClient = await client.authentication.getApiClient();
    console.log(`API key acts for company ${apiClient.data.json<{ companyId: string }>().companyId}.`);
  }
}

/** List the grids, then read every row of one (jobs are listed through the grid endpoints). */
export async function pageGrid(client: TransynqClient, gridId = 'jobs'): Promise<void> {
  for (const grid of (await client.grids.listGrids()).data) console.log(`grid ${grid.id}: ${grid.title}`);
  const request: GridQueryRequest = { columns: null, filters: null, sort: null, page: null, pageSize: 200, search: null, summaries: null };
  let count = 0;
  for await (const row of client.iterateGridRows(gridId, request)) {
    if (++count <= 5) console.log(row);
  }
  console.log(`${count} rows`);
  // a classic paged collection with auto-paging
  for await (const reason of client.referenceData.listJobStatusReasonsAutoPaging({ activeOnly: true, pageSize: 100 })) {
    console.log(`${reason.reasonType}: ${reason.name}`);
  }
}

/** Create a job (booking) idempotently: the client-generated id makes a retry return the same record. */
export async function createBooking(client: TransynqClient, customerId: string, senderId: string, recipientId: string): Promise<void> {
  const booking: BookingRequestDto = {
    id: newId(),
    customerId,
    senderId,
    recipientId,
    bookDate: new Date().toISOString(),
    jobKindId: null,
    jobStatusId: null,
    serviceCodeId: null,
    depotId: null,
    specialInstructions: 'Call before delivery',
    warehouseInstructions: null,
    senderNote: null,
    recipientNote: null,
    senderPhone: null,
    recipientPhone: null,
    readyFromDate: null,
    requiredDate: null,
    invoicingOnly: false,
    references: null,
    products: [],
    legs: [],
    pricings: [],
    notes: [],
  };
  const created = await client.bookings.createBooking(booking);
  console.log(`Booking ${booking.id} saved (${created.statusCode}); correlation id ${created.correlationId}.`);
}

/** Update with optimistic concurrency: read the ETag, send it as If-Match, retry on a stale version. */
export async function updateHoliday(client: TransynqClient, holidayId: string): Promise<void> {
  const saved = await readModifyWrite(
    () => client.referenceData.getPublicHoliday(holidayId),
    (current, options) =>
      client.referenceData.updatePublicHoliday(
        holidayId,
        { id: current.id, name: current.name.trim(), date: current.date, countryId: current.countryId, states: current.states },
        options,
      ),
  );
  console.log(`Saved; new ETag ${saved.etag}.`);
}

/** List sales-ledger invoices of the last 30 days. */
export async function listInvoices(client: TransynqClient): Promise<void> {
  const now = Date.now();
  const response = await client.salesLedger.getSalesLedgerInvoices({
    from: new Date(now - 30 * 86_400_000).toISOString(),
    to: new Date(now).toISOString(),
    take: 50,
  });
  console.log(response.data.json());
}

/** Upload a proof of delivery to a job. */
export async function uploadPod(client: TransynqClient, jobId: string, path: string): Promise<void> {
  const file = FileUpload.fromBytes(await readFile(path), basename(path), 'application/pdf');
  const added = await client.jobs.addJobPods(jobId, { files: [file] });
  console.log(`Added POD(s): ${added.data.ids.join(', ')}`);
}

/** Queue a background import and wait for the long operation to finish. */
export async function longOperation(client: TransynqClient, workbook: string): Promise<void> {
  const file = FileUpload.fromBytes(await readFile(workbook), basename(workbook), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const accepted = await client.imports.importZonesInBackground({ file });
  try {
    const done = await client.pollLongOperation(accepted).wait({ pollIntervalMs: 2000, onProgress: (op) => console.log(`${op.kind}: ${op.status}`) });
    console.log('Result:', done.result);
  } catch (error) {
    if (error instanceof LongOperationFailedError) console.error('Import failed:', error.operation.error);
    else throw error;
  }
}

async function main(argv: string[]): Promise<number> {
  const [flow = 'sign-in', a = '', b = '', c = ''] = argv;
  const client = createClient();
  switch (flow) {
    case 'sign-in':
      await signIn(client);
      break;
    case 'page-grid':
      await pageGrid(client, a || 'jobs');
      break;
    case 'create-booking':
      await createBooking(client, a, b, c);
      break;
    case 'update-holiday':
      await updateHoliday(client, a);
      break;
    case 'list-invoices':
      await listInvoices(client);
      break;
    case 'upload-pod':
      await uploadPod(client, a, b);
      break;
    case 'long-operation':
      await longOperation(client, a);
      break;
    default:
      console.error(`Unknown flow '${flow}'.`);
      return 1;
  }
  return 0;
}

if (process.argv[1]?.endsWith('flows.ts') || process.argv[1]?.endsWith('flows.js')) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
