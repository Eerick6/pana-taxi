export const NOTIFICATION_QUEUE = 'notifications';

export interface FcmJobData {
  type: 'fcm';
  userId?: string;
  tokens?: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface SmsJobData {
  type: 'sms';
  to: string;
  message: string;
}

export type NotificationJobData = FcmJobData | SmsJobData;
