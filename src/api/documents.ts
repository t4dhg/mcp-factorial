/**
 * Document API endpoints: Folders, Documents, Downloads
 */

import { fetchList, fetchOne } from '../http-client.js';
import { cached, CACHE_TTL } from '../cache.js';
import { debug } from '../config.js';
import { isOAuth2Configured, getOAuth2AccessToken } from '../oauth.js';
import { buildPaginationParams, paginateResponse, type PaginatedResponse } from '../pagination.js';
import type { Folder, Document } from '../schemas.js';
import { validateId } from '../utils.js';
import { ENDPOINTS, endpointWithId } from '../endpoints.js';
import { NotFoundError } from '../errors.js';
import type { ListDocumentsOptions } from '../types.js';

/**
 * List all folders
 */
export async function listFolders(): Promise<Folder[]> {
  return cached('folders:all', () => fetchList<Folder>(ENDPOINTS.folders), CACHE_TTL.default);
}

/**
 * Get a specific folder by ID
 */
export async function getFolder(id: number): Promise<Folder> {
  validateId(id, 'folder');

  return fetchOne<Folder>(endpointWithId(ENDPOINTS.folders, id));
}

/**
 * List documents with optional filtering by folder
 */
export async function listDocuments(
  options?: ListDocumentsOptions
): Promise<PaginatedResponse<Document>> {
  const params = buildPaginationParams(options);

  const queryParams: Record<string, string | number | undefined> = {
    page: params.page,
    limit: params.limit,
  };

  if (options?.folder_id) queryParams.folder_id = options.folder_id;

  // Handle employee_ids array parameter
  // Factorial API expects: employee_ids[]=123&employee_ids[]=456
  if (options?.employee_ids && options.employee_ids.length > 0) {
    // We'll need to build the query string manually for array parameters
    const employeeIdsParam = options.employee_ids.map(id => `employee_ids[]=${id}`).join('&');
    const baseParams = new URLSearchParams(queryParams as Record<string, string>).toString();
    const fullParams = baseParams ? `${baseParams}&${employeeIdsParam}` : employeeIdsParam;

    // Make request with custom query string
    const documents = await fetchList<Document>(`${ENDPOINTS.documents}?${fullParams}`);

    debug(`listDocuments returned ${documents.length} documents`, {
      sampleDocument: documents[0],
      missingNames: documents.filter(d => !d.name).length,
    });

    return paginateResponse(documents, params.page, params.limit);
  }

  const documents = await fetchList<Document>(ENDPOINTS.documents, { params: queryParams });

  debug(`listDocuments returned ${documents.length} documents`, {
    sampleDocument: documents[0],
    missingNames: documents.filter(d => !d.name).length,
  });

  return paginateResponse(documents, params.page, params.limit);
}

/**
 * Get a specific document by ID
 *
 * Note: The Factorial API's individual document endpoint (/documents/documents/{id})
 * can be unreliable, similar to the employee endpoint. This function implements a fallback
 * to listing all documents and filtering if the direct endpoint fails or returns no data.
 *
 * @param id - The document ID
 * @returns The document object
 * @throws Error if document is not found
 */
export async function getDocument(id: number): Promise<Document> {
  validateId(id, 'document');

  // Try the direct endpoint first
  try {
    const document = await fetchOne<Document>(endpointWithId(ENDPOINTS.documents, id));

    // If we got a valid document, return it
    if (document) {
      return document;
    }
  } catch (error) {
    // If direct fetch fails with NotFoundError, try fallback
    if (!(error instanceof NotFoundError)) {
      throw error;
    }
    debug(`getDocument(${id}) - direct endpoint failed, using fallback`);
  }

  // Fallback: Fetch all documents and filter by ID
  // This works around Factorial API limitations with the individual document endpoint
  const allDocuments = await fetchList<Document>(ENDPOINTS.documents);

  const document = allDocuments.find(doc => doc.id === id);

  if (!document) {
    throw new Error(`Document with ID ${id} not found.`);
  }

  return document;
}

/**
 * Response from the download-urls/bulk-create endpoint
 */
interface DownloadUrlResponse {
  document_id: number;
  url: string;
}

/**
 * Get download URLs for documents using the bulk-create endpoint
 *
 * This endpoint requires OAuth2 authentication. If OAuth2 credentials are configured
 * (FACTORIAL_OAUTH_CLIENT_ID, FACTORIAL_OAUTH_CLIENT_SECRET, FACTORIAL_OAUTH_REFRESH_TOKEN),
 * the function will use them automatically. Otherwise, it will fail with a helpful error.
 *
 * @param documentIds - Array of document IDs to get download URLs for
 * @returns Array of document IDs with their signed download URLs
 * @throws Error if OAuth2 is not configured or token refresh fails
 */
export async function getDocumentDownloadUrls(
  documentIds: number[]
): Promise<DownloadUrlResponse[]> {
  // Check if OAuth2 is configured
  if (!isOAuth2Configured()) {
    throw new Error(
      'Document download requires OAuth2 authentication.\n\n' +
        'To enable document downloads, configure OAuth2 credentials:\n' +
        '  1. Create an OAuth2 application in Factorial (Settings → Integrations)\n' +
        '  2. Complete the authorization flow to get a refresh token\n' +
        '  3. Set environment variables:\n' +
        '     - FACTORIAL_OAUTH_CLIENT_ID\n' +
        '     - FACTORIAL_OAUTH_CLIENT_SECRET\n' +
        '     - FACTORIAL_OAUTH_REFRESH_TOKEN\n\n' +
        'See: https://apidoc.factorialhr.com/docs/authentication for OAuth2 setup.\n' +
        `Document IDs requested: ${documentIds.join(', ')}`
    );
  }

  // Get OAuth2 access token
  const accessToken = await getOAuth2AccessToken();

  // The download-urls endpoint uses API version 2025-01-01
  const downloadUrlsEndpoint =
    'https://api.factorialhr.com/api/2025-01-01/resources/documents/download-urls/bulk-create';

  debug('Requesting document download URLs with OAuth2', { documentIds });

  const response = await fetch(downloadUrlsEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ document_ids: documentIds }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData: { errors?: string[] } | null = null;
    try {
      errorData = JSON.parse(errorText) as { errors?: string[] };
    } catch {
      // Ignore parse errors
    }

    // Handle specific errors
    if (response.status === 401) {
      throw new Error(
        'OAuth2 authentication failed. The access token may have expired or been revoked.\n' +
          'Try refreshing your credentials or re-authorizing the OAuth2 application.'
      );
    }

    if (errorData?.errors?.some(e => e.includes('not found'))) {
      throw new Error(
        `Documents not found or not accessible. Document IDs: ${documentIds.join(', ')}`
      );
    }

    throw new Error(`Failed to get download URLs: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { data: DownloadUrlResponse[] };
  debug('Document download URLs retrieved successfully', { count: data.data.length });
  return data.data;
}

/**
 * Download a document by getting its signed URL and fetching the content
 * @param id - The document ID
 * @param outputDir - Directory to save the file to
 * @returns Path to the downloaded file and metadata
 */
export async function downloadDocument(
  id: number,
  outputDir: string
): Promise<{ path: string; document: Document }> {
  // First get the document metadata for filename info
  const document = await getDocument(id);

  // Get the signed download URL
  const downloadUrls = await getDocumentDownloadUrls([id]);
  const urlInfo = downloadUrls.find(u => u.document_id === id);

  if (!urlInfo?.url) {
    throw new Error(`No download URL returned for document ${id}`);
  }

  // Ensure output directory exists
  const fs = await import('fs/promises');
  const path = await import('path');
  await fs.mkdir(outputDir, { recursive: true });

  // Generate filename from document name or ID
  const filename = document.name || `document-${id}`;
  const outputPath = path.join(outputDir, filename);

  // Download the file from the signed URL
  const response = await fetch(urlInfo.url);
  if (!response.ok) {
    throw new Error(`Failed to download document: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, buffer);

  debug(`Downloaded document ${id} to ${outputPath}`, {
    size: buffer.length,
    mime: document.mime_type,
  });

  return { path: outputPath, document };
}

/**
 * Download all payslips for an employee
 * @param employeeId - The employee ID
 * @param outputDir - Directory to save files to
 * @returns Array of downloaded file paths and metadata
 */
export async function downloadEmployeePayslips(
  employeeId: number,
  outputDir: string
): Promise<Array<{ path: string; document: Document }>> {
  // Find the Nómina (payslip) folder
  const folders = await listFolders();
  const payslipFolder = folders.find(
    f =>
      f.name.toLowerCase() === 'nómina' ||
      f.name.toLowerCase() === 'nomina' ||
      f.name.toLowerCase() === 'payslips'
  );

  if (!payslipFolder) {
    throw new Error('Could not find payslip folder (Nómina) in Factorial');
  }

  // Get all documents for this employee in the payslip folder
  const allDocs = await listDocuments({ employee_ids: [employeeId] });
  const payslipDocs = allDocs.data.filter(d => d.folder_id === payslipFolder.id);

  if (payslipDocs.length === 0) {
    throw new Error(`No payslips found for employee ${employeeId}`);
  }

  // Download each payslip
  const results: Array<{ path: string; document: Document }> = [];
  for (const doc of payslipDocs) {
    try {
      const result = await downloadDocument(doc.id, outputDir);
      results.push(result);
    } catch (error) {
      debug(
        `Failed to download payslip ${doc.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  return results;
}

/**
 * Download any employee document by ID
 * @param documentId - The document ID
 * @param outputDir - Directory to save the file to
 * @returns Path to the downloaded file and metadata
 */
export async function downloadEmployeeDocument(
  documentId: number,
  outputDir: string
): Promise<{ path: string; document: Document }> {
  return downloadDocument(documentId, outputDir);
}
