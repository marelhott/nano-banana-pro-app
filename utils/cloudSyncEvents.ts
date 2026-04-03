export type CloudSyncResource = 'saved-image' | 'generated-image';
export type CloudSyncStatus = 'failed';

export type CloudSyncEventDetail = {
  status: CloudSyncStatus;
  resource: CloudSyncResource;
  message: string;
};

export const CLOUD_SYNC_EVENT_NAME = 'mulen:cloud-sync';

export function dispatchCloudSyncEvent(detail: CloudSyncEventDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<CloudSyncEventDetail>(CLOUD_SYNC_EVENT_NAME, { detail }));
}
