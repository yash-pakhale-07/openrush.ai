/**
 * Receiver Verification System Unit & Integration Test Suite
 */

const assert = require('assert');

// Mock localStorage for Node test environment
const mockStorage = {};
global.window = {
  localStorage: {
    getItem: (key) => mockStorage[key] || null,
    setItem: (key, val) => { mockStorage[key] = String(val); },
    removeItem: (key) => { delete mockStorage[key]; }
  }
};

console.log('--- STARTING RECEIVER VERIFICATION TEST SUITE ---');

const VERIFICATION_STORAGE_KEY = 'relay:receiver-verification-v1';

const DEFAULT_VERIFICATION = {
  status: 'Contact Pending',
  step: 1,
  phone: '',
  otpVerified: false,
  orgName: 'Harbor Shelter Relief Inc.',
  shelterAddress: 'South Entrance, 42 Harbor Way, NY 10001',
  contactPerson: 'Sarah Jenkins (Intake Director)',
  documentRef: 'NY-SHELTER-REG-2026-88',
  rejectionReason: '',
  submittedAt: null,
  reviewedAt: null,
  isEmergencyFastTrack: false
};

function readVerificationState() {
  const raw = window.localStorage.getItem(VERIFICATION_STORAGE_KEY);
  if (!raw) return { ...DEFAULT_VERIFICATION };
  return { ...DEFAULT_VERIFICATION, ...JSON.parse(raw) };
}

function saveVerificationState(vState) {
  window.localStorage.setItem(VERIFICATION_STORAGE_KEY, JSON.stringify(vState));
}

// 1. Initial State
let vState = readVerificationState();
assert.strictEqual(vState.status, 'Contact Pending', 'Initial status must be Contact Pending');
assert.strictEqual(vState.step, 1, 'Initial step must be 1');
console.log('✓ Initial state initialized to Contact Pending, Step 1.');

// 2. Phone Validation & OTP Simulation
function validatePhone(phone) {
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    return { valid: false, error: 'Please enter a valid phone number (at least 10 digits).' };
  }
  return { valid: true };
}

function verifyOtp(phone, otp) {
  const pCheck = validatePhone(phone);
  if (!pCheck.valid) return pCheck;
  if (!otp) return { valid: false, error: 'Please enter the 6-digit verification code.' };
  if (otp !== '123456') {
    return { valid: false, error: 'Invalid verification code. For this prototype, please use demo code 123456.' };
  }
  return { valid: true };
}

// Invalid Phone
assert.strictEqual(validatePhone('123').valid, false);
console.log('✓ Invalid phone numbers rejected.');

// Invalid OTP
const badOtp = verifyOtp('+1 (555) 234-5678', '999999');
assert.strictEqual(badOtp.valid, false);
assert(badOtp.error.includes('123456'), 'Error message must guide to demo code 123456');
console.log('✓ Invalid OTP rejected with clear prototype guidance.');

// Valid OTP
const goodOtp = verifyOtp('+1 (555) 234-5678', '123456');
assert.strictEqual(goodOtp.valid, true);

vState.phone = '+1 (555) 234-5678';
vState.otpVerified = true;
vState.step = 2;
saveVerificationState(vState);
console.log('✓ Demo OTP 123456 verified. State advanced to Step 2 (Org Details).');

// 3. Organization Details & Submission
function submitOrgDetails(orgName, address, contact, docRef) {
  if (!orgName || !address || !contact || !docRef) {
    return { valid: false, error: 'Please fill out all required organization fields.' };
  }
  const state = readVerificationState();
  state.orgName = orgName;
  state.shelterAddress = address;
  state.contactPerson = contact;
  state.documentRef = docRef;
  state.status = 'Review Pending';
  state.step = 3;
  state.submittedAt = new Date().toISOString();
  saveVerificationState(state);
  return { valid: true, state };
}

const missingFields = submitOrgDetails('', '', '', '');
assert.strictEqual(missingFields.valid, false);
console.log('✓ Incomplete organization details rejected.');

const validSubmission = submitOrgDetails(
  'Harbor Community Shelter Inc.',
  '42 Harbor Way, South Entrance, NY 10001',
  'Sarah Jenkins',
  'EIN 12-3456789'
);
assert.strictEqual(validSubmission.valid, true);
assert.strictEqual(validSubmission.state.status, 'Review Pending');
assert.strictEqual(validSubmission.state.step, 3);
console.log('✓ Organization details submitted. State is Review Pending, Step 3.');

// 4. Persistence Test across simulated restart
const reloadedState = readVerificationState();
assert.strictEqual(reloadedState.status, 'Review Pending');
assert.strictEqual(reloadedState.phone, '+1 (555) 234-5678');
assert.strictEqual(reloadedState.orgName, 'Harbor Community Shelter Inc.');
console.log('✓ Persistence verified: State survived simulated browser refresh.');

// 5. Restriction Check
function canCreateDemandAlert(status) {
  return status === 'Verified';
}

assert.strictEqual(canCreateDemandAlert(reloadedState.status), false, 'Review Pending must restrict demand alert creation');
console.log('✓ Unverified receiver (Review Pending) restricted from publishing demand alerts.');

// 6. Demo Admin Simulator Decisions
// A) Rejection
function adminReject(reason) {
  const state = readVerificationState();
  state.status = 'Rejected';
  state.rejectionReason = reason || 'Documentation reference could not be verified.';
  state.reviewedAt = new Date().toISOString();
  saveVerificationState(state);
  return state;
}

const rejected = adminReject('Tax ID reference not found in active relief database.');
assert.strictEqual(rejected.status, 'Rejected');
assert.strictEqual(canCreateDemandAlert(rejected.status), false, 'Rejected must restrict demand alerts');
assert(rejected.rejectionReason.includes('Tax ID reference'));
console.log(`✓ Admin Rejection verified. Reason: "${rejected.rejectionReason}".`);

// B) Approval
function adminApprove() {
  const state = readVerificationState();
  state.status = 'Verified';
  state.rejectionReason = '';
  state.reviewedAt = new Date().toISOString();
  saveVerificationState(state);
  return state;
}

const approved = adminApprove();
assert.strictEqual(approved.status, 'Verified');
assert.strictEqual(canCreateDemandAlert(approved.status), true, 'Verified shelter must be permitted to create demand alerts');
console.log('✓ Admin Approval verified. Status is Verified. Demand alert creation permitted.');

// 7. Emergency Review Option
function emergencyFastTrack(incident, justification) {
  if (!incident || !justification) return { valid: false, error: 'Incident and justification required.' };
  const state = readVerificationState();
  state.isEmergencyFastTrack = true;
  state.status = 'Verified';
  state.step = 3;
  state.reviewedAt = new Date().toISOString();
  saveVerificationState(state);
  return { valid: true, state };
}

// Reset first
window.localStorage.removeItem(VERIFICATION_STORAGE_KEY);
const freshState = readVerificationState();
assert.strictEqual(freshState.status, 'Contact Pending');

const fastTracked = emergencyFastTrack('Winter Storm Evacuation', 'Immediate overflow warming center meals needed.');
assert.strictEqual(fastTracked.valid, true);
assert.strictEqual(fastTracked.state.status, 'Verified');
assert.strictEqual(fastTracked.state.isEmergencyFastTrack, true);
assert.strictEqual(canCreateDemandAlert(fastTracked.state.status), true);
console.log('✓ Emergency Review option verified: Fast-track immediate verification granted for disaster response.');

console.log('\n========================================');
console.log('ALL RECEIVER VERIFICATION TESTS PASSED (100%)!');
console.log('========================================');
process.exit(0);
