import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { createAdminService } from './admin-service.mjs';

initializeApp();
const service = createAdminService(getAuth(), getFirestore(), (code, message) => new HttpsError(code, message));
const options = { region: 'us-central1', maxInstances: 3, timeoutSeconds: 120 };
export const adminListUsers = onCall(options, request => service.list(request));
export const adminUserGrades = onCall(options, request => service.grades(request));
export const adminDeleteUser = onCall(options, request => service.remove(request));
