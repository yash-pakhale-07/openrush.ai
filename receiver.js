/**
 * Relay - Shelter / Receiver Dashboard Logic
 * Uses RelayStore for shared state, persistent storage, and real-time synchronization.
 * Includes Two-Step Receiver Verification System with Simulated Contact OTP,
 * Organization Review, Gatekeeping, and Emergency Fast-Track Verification.
 */

(function () {
  'use strict';

  const VERIFICATION_STORAGE_KEY = 'relay:receiver-verification-v1';

  // --- VERIFICATION STATE & PERSISTENCE ---
  const DEFAULT_VERIFICATION = {
    status: 'Contact Pending', // 'Contact Pending' | 'Review Pending' | 'Verified' | 'Rejected'
    step: 1, // 1 (Phone & OTP), 2 (Org Details), 3 (Review & Admin Simulator)
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
    try {
      const raw = window.localStorage.getItem(VERIFICATION_STORAGE_KEY);
      if (!raw) return { ...DEFAULT_VERIFICATION };
      return { ...DEFAULT_VERIFICATION, ...JSON.parse(raw) };
    } catch (e) {
      return { ...DEFAULT_VERIFICATION };
    }
  }

  function saveVerificationState(vState) {
    try {
      window.localStorage.setItem(VERIFICATION_STORAGE_KEY, JSON.stringify(vState));
    } catch (e) {
      console.warn('Failed to persist verification state', e);
    }
    updateVerificationUI(vState);
  }

  // --- DOM ELEMENTS: Modals & Forms ---
  const demandModal = document.querySelector('#demand-alert-modal');
  const demandForm = document.querySelector('#demand-alert-form');
  const demandCategory = document.querySelector('#demand-category');
  const customCategoryField = document.querySelector('#custom-category-field');
  const customCategory = document.querySelector('#custom-category');
  const submitDemandButton = document.querySelector('#submit-demand-alert');
  const submitDemandLabel = document.querySelector('#submit-demand-label');
  const demandFeedback = document.querySelector('#demand-form-feedback');

  const intakeModal = document.querySelector('#intake-modal');
  const intakeForm = document.querySelector('#intake-form');
  const intakeCapacityInput = document.querySelector('#intake-capacity-input');
  const intakeStatusSelect = document.querySelector('#intake-status-select');
  const intakeWindowInput = document.querySelector('#intake-window-input');
  const intakeEntranceInput = document.querySelector('#intake-entrance-input');
  const intakeFeedback = document.querySelector('#intake-form-feedback');
  const submitIntakeBtn = document.querySelector('#submit-intake-btn');

  // Verification DOM elements
  const verifModal = document.querySelector('#verification-modal');
  const verifGateModal = document.querySelector('#verification-gate-modal');
  const emergencyModal = document.querySelector('#emergency-review-modal');
  const topbarVerifBtn = document.querySelector('#topbar-verif-btn');
  const topbarVerifDot = document.querySelector('#topbar-verif-dot');
  const topbarVerifLabel = document.querySelector('#topbar-verif-label');
  const verifBannerContainer = document.querySelector('#verification-banner-container');

  // Step 1: Contact
  const verifPhoneInput = document.querySelector('#verif-phone');
  const btnSendOtp = document.querySelector('#btn-send-otp');
  const otpSentIndicator = document.querySelector('#otp-sent-indicator');
  const verifOtpContainer = document.querySelector('#verif-otp-container');
  const verifOtpInput = document.querySelector('#verif-otp');
  const btnVerifyOtp = document.querySelector('#btn-verify-otp');
  const otpErrorMsg = document.querySelector('#otp-error-msg');
  const contactVerifFeedback = document.querySelector('#contact-verif-feedback');

  // Step 2: Org Details
  const step2PhoneDisplay = document.querySelector('#step2-verified-phone-display');
  const orgVerifForm = document.querySelector('#org-verif-form');
  const verifOrgName = document.querySelector('#verif-org-name');
  const verifAddress = document.querySelector('#verif-address');
  const verifContactName = document.querySelector('#verif-contact-name');
  const verifDocRef = document.querySelector('#verif-doc-ref');
  const orgVerifFeedback = document.querySelector('#org-verif-feedback');
  const btnBackToStep1 = document.querySelector('#btn-back-to-step1');

  // Step 3: Status & Admin Simulator
  const verifStatusSummaryBox = document.querySelector('#verif-status-summary-box');
  const rejectionCalloutContainer = document.querySelector('#rejection-callout-container');
  const verifiedSuccessContainer = document.querySelector('#verified-success-container');
  const adminRejectionReasonInput = document.querySelector('#admin-rejection-reason-input');
  const btnAdminApprove = document.querySelector('#btn-admin-approve');
  const btnAdminReject = document.querySelector('#btn-admin-reject');
  const btnAdminFasttrack = document.querySelector('#btn-admin-fasttrack');
  const btnAdminReset = document.querySelector('#btn-admin-reset');
  const btnCreateDemandFromVerif = document.querySelector('#btn-create-demand-from-verif');
  const btnCloseVerifView = document.querySelector('#btn-close-verif-view');

  // Step indicators & panels
  const stepTab1 = document.querySelector('#step-tab-1');
  const stepTab2 = document.querySelector('#step-tab-2');
  const stepTab3 = document.querySelector('#step-tab-3');
  const step1Panel = document.querySelector('#verif-step-1-panel');
  const step2Panel = document.querySelector('#verif-step-2-panel');
  const step3Panel = document.querySelector('#verif-step-3-panel');

  // Gatekeeping modal elements
  const gateStatusDetailBox = document.querySelector('#gate-status-detail-box');
  const gateBtnProceed = document.querySelector('#gate-btn-proceed');
  const gateBtnEmergency = document.querySelector('#gate-btn-emergency');
  const gateBtnCancel = document.querySelector('#gate-btn-cancel');

  // Emergency review modal elements
  const emergencyForm = document.querySelector('#emergency-review-form');
  const emergencyIncidentTitle = document.querySelector('#emergency-incident-title');
  const emergencyJustification = document.querySelector('#emergency-justification');
  const emergencyFeedback = document.querySelector('#emergency-feedback');
  const cancelEmergencyBtn = document.querySelector('#cancel-emergency-btn');

  // Dashboard content elements
  const demandList = document.querySelector('#demand-alert-list');
  const trackingArea = document.querySelector('#receiver-tracking-area');
  const activeDemandCount = document.querySelector('#active-demand-count');
  const activeDemandSub = document.querySelector('#active-demand-sub');
  const mealsConfirmedCount = document.querySelector('#meals-confirmed-count');
  const mealsConfirmedSub = document.querySelector('#meals-confirmed-sub');
  const intakeCapacityCount = document.querySelector('#intake-capacity-count');
  const intakeCapacitySub = document.querySelector('#intake-capacity-sub');
  const receiverStatusBanner = document.querySelector('#receiver-status-banner');
  const activeDemandFooter = document.querySelector('#active-demand-footer');
  const demandToast = document.querySelector('#demand-toast');

  let demandToastTimer;
  let isSubmittingDemand = false;
  let isSubmittingIntake = false;

  function showToast(message) {
    if (!demandToast) return;
    demandToast.textContent = message;
    demandToast.classList.add('show');
    window.clearTimeout(demandToastTimer);
    demandToastTimer = window.setTimeout(() => demandToast.classList.remove('show'), 4200);
  }

  function formatDeadline(value) {
    if (!value) return 'TBD';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }

  // --- UI RENDER: Verification System ---
  function updateVerificationUI(vState) {
    // 1. Update Topbar pill
    if (topbarVerifLabel) topbarVerifLabel.textContent = vState.status;
    if (topbarVerifDot) {
      topbarVerifDot.className = 'verification-dot';
      if (vState.status === 'Verified') topbarVerifDot.classList.add('status-verified');
      else if (vState.status === 'Review Pending') topbarVerifDot.classList.add('status-review-pending');
      else if (vState.status === 'Rejected') topbarVerifDot.classList.add('status-rejected');
      else topbarVerifDot.classList.add('status-contact-pending');
    }

    // 2. Update Dashboard Banner
    if (verifBannerContainer) {
      verifBannerContainer.innerHTML = '';
      if (vState.status === 'Contact Pending') {
        verifBannerContainer.innerHTML = `
          <div class="verification-dashboard-banner">
            <div>
              <b>⚠️ Shelter Verification Required · Safety &amp; Trust Gate</b>
              <p>Complete two-step verification (contact phone &amp; shelter registry) to enable publishing active demand alerts.</p>
            </div>
            <div class="verification-banner-actions">
              <button class="queue-action-btn" id="banner-verify-btn" type="button">Complete Verification ↗</button>
              <button class="queue-action-btn secondary" id="banner-emergency-btn" type="button">Emergency Review ⚡</button>
            </div>
          </div>
        `;
      } else if (vState.status === 'Review Pending') {
        const isEmergency = vState.isEmergencyFastTrack;
        verifBannerContainer.innerHTML = `
          <div class="verification-dashboard-banner is-pending">
            <div>
              <b>⏳ Verification Review Pending ${isEmergency ? '· ⚡ Emergency Expedited' : ''}</b>
              <p>Your shelter credentials are under review by network administrators. Demand alert publishing unlocks upon approval.</p>
            </div>
            <div class="verification-banner-actions">
              <button class="queue-action-btn" id="banner-review-status-btn" type="button">View Review Status ↗</button>
              ${!isEmergency ? `<button class="queue-action-btn secondary" id="banner-emergency-btn" type="button">Emergency Expedite ⚡</button>` : ''}
            </div>
          </div>
        `;
      } else if (vState.status === 'Rejected') {
        verifBannerContainer.innerHTML = `
          <div class="verification-dashboard-banner is-rejected">
            <div>
              <b>✕ Shelter Verification Rejected</b>
              <p>${vState.rejectionReason ? `Reason: ${escapeHtml(vState.rejectionReason)}` : 'Documentation could not be verified.'} Update your information and resubmit.</p>
            </div>
            <div class="verification-banner-actions">
              <button class="queue-action-btn danger" id="banner-reapply-btn" type="button">Update &amp; Resubmit ↗</button>
            </div>
          </div>
        `;
      } else if (vState.status === 'Verified') {
        verifBannerContainer.innerHTML = `
          <div class="verification-dashboard-banner is-verified">
            <div>
              <b>✓ Verified Relief Facility · Intake Authorized</b>
              <p>Your shelter identity is verified. Active demand alerts are broadcast directly to donor kitchens and volunteer riders.</p>
            </div>
            <div class="verification-banner-actions">
              <button class="queue-action-btn secondary" id="banner-view-verif-btn" type="button">View Credentials ↗</button>
            </div>
          </div>
        `;
      }

      // Bind banner action buttons
      document.querySelector('#banner-verify-btn')?.addEventListener('click', () => openVerificationModal(1));
      document.querySelector('#banner-review-status-btn')?.addEventListener('click', () => openVerificationModal(3));
      document.querySelector('#banner-reapply-btn')?.addEventListener('click', () => openVerificationModal(2));
      document.querySelector('#banner-view-verif-btn')?.addEventListener('click', () => openVerificationModal(3));
      document.querySelector('#banner-emergency-btn')?.addEventListener('click', openEmergencyModal);
    }

    // 3. Update Modal Panels & Step Indicators
    if (stepTab1 && stepTab2 && stepTab3) {
      stepTab1.className = 'step-tab-indicator';
      stepTab2.className = 'step-tab-indicator';
      stepTab3.className = 'step-tab-indicator';

      if (vState.step === 1) {
        stepTab1.classList.add('active');
        if (step1Panel) step1Panel.hidden = false;
        if (step2Panel) step2Panel.hidden = true;
        if (step3Panel) step3Panel.hidden = true;
      } else if (vState.step === 2) {
        stepTab1.classList.add('completed');
        stepTab2.classList.add('active');
        if (step1Panel) step1Panel.hidden = true;
        if (step2Panel) step2Panel.hidden = false;
        if (step3Panel) step3Panel.hidden = true;
        if (step2PhoneDisplay) step2PhoneDisplay.textContent = vState.phone || 'Phone verified';
      } else if (vState.step === 3) {
        stepTab1.classList.add('completed');
        stepTab2.classList.add('completed');
        stepTab3.classList.add('active');
        if (step1Panel) step1Panel.hidden = true;
        if (step2Panel) step2Panel.hidden = true;
        if (step3Panel) step3Panel.hidden = false;
      }
    }

    // 4. Update Step 3 Details
    if (verifStatusSummaryBox) {
      let statusTagClass = 'badge-tag';
      if (vState.status === 'Verified') statusTagClass = 'badge-tag live';
      else if (vState.status === 'Rejected') statusTagClass = 'badge-tag alert';

      verifStatusSummaryBox.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <b>Shelter Verification Credentials</b>
          <span class="${statusTagClass}">${escapeHtml(vState.status)}</span>
        </div>
        <p>
          Organization: <strong>${escapeHtml(vState.orgName || 'Harbor Shelter Relief Inc.')}</strong><br/>
          Facility Address: ${escapeHtml(vState.shelterAddress || '42 Harbor Way, NY')}<br/>
          Contact Person: ${escapeHtml(vState.contactPerson || 'Sarah Jenkins')}<br/>
          Verified Phone: <strong>${escapeHtml(vState.phone || 'Pending')}</strong><br/>
          Document Reference: <code>${escapeHtml(vState.documentRef || 'Pending')}</code><br/>
          ${vState.submittedAt ? `<small style="color:var(--muted); font-size:9px;">Submitted: ${formatDeadline(vState.submittedAt)}</small>` : ''}
        </p>
      `;
    }

    if (rejectionCalloutContainer) {
      rejectionCalloutContainer.innerHTML = '';
      if (vState.status === 'Rejected') {
        rejectionCalloutContainer.innerHTML = `
          <div class="recalculation-alert" style="margin-top:12px;">
            <b>✕ Application Review Decision: REJECTED</b>
            ${vState.rejectionReason ? `Reason: ${escapeHtml(vState.rejectionReason)}<br/>` : ''}
            Please check your organization details or contact credentials and resubmit.
            <div style="margin-top:10px;">
              <button class="queue-action-btn danger" id="btn-edit-resubmit" type="button">Edit Details &amp; Resubmit ↗</button>
            </div>
          </div>
        `;
        document.querySelector('#btn-edit-resubmit')?.addEventListener('click', () => {
          vState.step = 2;
          saveVerificationState(vState);
        });
      }
    }

    if (verifiedSuccessContainer) {
      verifiedSuccessContainer.innerHTML = '';
      if (vState.status === 'Verified') {
        verifiedSuccessContainer.innerHTML = `
          <div class="demo-callout-box" style="margin-top:12px; background:#f4faf1; border-color:#59966a;">
            <b>✓ Shelter Organization Successfully Verified</b>
            Your facility is authorized to broadcast real-time demand alerts to local kitchens and food suppliers.
          </div>
        `;
        if (btnCreateDemandFromVerif) btnCreateDemandFromVerif.hidden = false;
      } else {
        if (btnCreateDemandFromVerif) btnCreateDemandFromVerif.hidden = true;
      }
    }

    // 5. Update Gate Modal Content
    if (gateStatusDetailBox) {
      let statusDesc = '';
      if (vState.status === 'Contact Pending') {
        statusDesc = 'You have not completed mobile phone contact verification yet.';
      } else if (vState.status === 'Review Pending') {
        statusDesc = 'Your verification application has been submitted and is currently under administrative safety review.';
      } else if (vState.status === 'Rejected') {
        statusDesc = `Your previous verification application was rejected (${vState.rejectionReason || 'details unverifiable'}). Please update and resubmit.`;
      }
      gateStatusDetailBox.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <b>Current Status: ${escapeHtml(vState.status)}</b>
          <span class="badge-tag ${vState.status === 'Rejected' ? 'alert' : ''}">${escapeHtml(vState.status)}</span>
        </div>
        <p>${escapeHtml(statusDesc)}</p>
      `;
    }
  }

  // --- MODAL CONTROLS: Verification Modal ---
  function openVerificationModal(targetStep = 1) {
    const vState = readVerificationState();
    // If target step is specified, update state
    if (targetStep >= 1 && targetStep <= 3) {
      vState.step = targetStep;
      saveVerificationState(vState);
    }
    // Pre-fill inputs
    if (verifPhoneInput) verifPhoneInput.value = vState.phone || '';
    if (verifOrgName) verifOrgName.value = vState.orgName || 'Harbor Shelter Relief Inc.';
    if (verifAddress) verifAddress.value = vState.shelterAddress || 'South Entrance, 42 Harbor Way, NY 10001';
    if (verifContactName) verifContactName.value = vState.contactPerson || 'Sarah Jenkins (Intake Director)';
    if (verifDocRef) verifDocRef.value = vState.documentRef || 'NY-SHELTER-REG-2026-88';

    if (verifOtpContainer) {
      verifOtpContainer.hidden = !vState.phone;
    }

    updateVerificationUI(vState);

    if (verifModal) {
      verifModal.hidden = false;
      document.body.style.overflow = 'hidden';
    }
  }

  function closeVerificationModal() {
    if (verifModal) {
      verifModal.hidden = true;
      document.body.style.overflow = '';
    }
  }

  // Gatekeeping Modal
  function openGateModal() {
    const vState = readVerificationState();
    updateVerificationUI(vState);
    if (verifGateModal) {
      verifGateModal.hidden = false;
      document.body.style.overflow = 'hidden';
    }
  }

  function closeGateModal() {
    if (verifGateModal) {
      verifGateModal.hidden = true;
      document.body.style.overflow = '';
    }
  }

  // Emergency Review Modal
  function openEmergencyModal() {
    closeGateModal();
    if (emergencyIncidentTitle) emergencyIncidentTitle.value = '';
    if (emergencyJustification) emergencyJustification.value = '';
    if (emergencyFeedback) emergencyFeedback.textContent = '';
    if (emergencyModal) {
      emergencyModal.hidden = false;
      document.body.style.overflow = 'hidden';
    }
  }

  function closeEmergencyModal() {
    if (emergencyModal) {
      emergencyModal.hidden = true;
      document.body.style.overflow = '';
    }
  }

  // --- STEP 1: CONTACT VERIFICATION LOGIC ---
  btnSendOtp?.addEventListener('click', () => {
    const phone = (verifPhoneInput?.value || '').trim();
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      setFieldError('verif-phone', 'Please enter a valid phone number (at least 10 digits).');
      return;
    }
    clearFormErrors(document.querySelector('#contact-verif-form'), contactVerifFeedback);

    if (verifOtpContainer) verifOtpContainer.hidden = false;
    if (otpSentIndicator) otpSentIndicator.style.display = 'inline';
    if (verifOtpInput) {
      verifOtpInput.focus();
      if (!verifOtpInput.value) verifOtpInput.value = '123456';
    }
    showToast('Simulated SMS sent. Demo OTP code: 123456');
  });

  btnVerifyOtp?.addEventListener('click', () => {
    const phone = (verifPhoneInput?.value || '').trim();
    const otp = (verifOtpInput?.value || '').trim();

    if (!phone || phone.replace(/\D/g, '').length < 10) {
      setFieldError('verif-phone', 'Enter a valid phone number first.');
      return;
    }

    if (!otp) {
      if (otpErrorMsg) otpErrorMsg.textContent = 'Please enter the 6-digit verification code.';
      verifOtpInput?.closest('.demand-field')?.classList.add('has-error');
      return;
    }

    if (otp !== '123456') {
      if (otpErrorMsg) otpErrorMsg.textContent = 'Invalid verification code. For this prototype, please use demo code 123456.';
      verifOtpInput?.closest('.demand-field')?.classList.add('has-error');
      return;
    }

    // Valid OTP
    if (otpErrorMsg) otpErrorMsg.textContent = '';
    verifOtpInput?.closest('.demand-field')?.classList.remove('has-error');

    const vState = readVerificationState();
    vState.phone = phone;
    vState.otpVerified = true;
    vState.step = 2; // Advance to Step 2
    saveVerificationState(vState);
    showToast('✓ Phone number verified successfully! Proceeding to Shelter Organization details.');
  });

  // --- STEP 2: ORG VERIFICATION LOGIC ---
  btnBackToStep1?.addEventListener('click', () => {
    const vState = readVerificationState();
    vState.step = 1;
    saveVerificationState(vState);
  });

  orgVerifForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    clearFormErrors(orgVerifForm, orgVerifFeedback);

    const orgName = (verifOrgName?.value || '').trim();
    const address = (verifAddress?.value || '').trim();
    const contact = (verifContactName?.value || '').trim();
    const docRef = (verifDocRef?.value || '').trim();

    let isValid = true;
    if (!orgName) { setFieldError('verif-org-name', 'Organization name is required.'); isValid = false; }
    if (!address) { setFieldError('verif-address', 'Facility address is required.'); isValid = false; }
    if (!contact) { setFieldError('verif-contact-name', 'Contact person name is required.'); isValid = false; }
    if (!docRef) { setFieldError('verif-doc-ref', 'Document reference / Tax ID is required.'); isValid = false; }

    if (!isValid) {
      if (orgVerifFeedback) orgVerifFeedback.textContent = 'Please fill out all required organization fields.';
      return;
    }

    const vState = readVerificationState();
    vState.orgName = orgName;
    vState.shelterAddress = address;
    vState.contactPerson = contact;
    vState.documentRef = docRef;
    vState.status = 'Review Pending';
    vState.step = 3;
    vState.submittedAt = new Date().toISOString();
    vState.rejectionReason = '';

    saveVerificationState(vState);
    showToast('Verification application submitted! Placed in administrative review queue.');
  });

  // --- STEP 3: DEMO ADMIN CONTROLS SIMULATOR ---
  btnAdminApprove?.addEventListener('click', () => {
    const vState = readVerificationState();
    vState.status = 'Verified';
    vState.reviewedAt = new Date().toISOString();
    vState.rejectionReason = '';
    saveVerificationState(vState);
    showToast('✓ [Admin Simulator] Shelter APPROVED and verified! Active demand alert creation unlocked.');
  });

  btnAdminReject?.addEventListener('click', () => {
    const reasonInput = adminRejectionReasonInput?.value?.trim();
    const reason = reasonInput || 'Document reference could not be verified in state relief registry.';
    const vState = readVerificationState();
    vState.status = 'Rejected';
    vState.rejectionReason = reason;
    vState.reviewedAt = new Date().toISOString();
    saveVerificationState(vState);
    showToast(`✕ [Admin Simulator] Shelter REJECTED. Reason: "${reason}"`);
  });

  btnAdminFasttrack?.addEventListener('click', () => {
    const vState = readVerificationState();
    vState.status = 'Verified';
    vState.isEmergencyFastTrack = true;
    vState.reviewedAt = new Date().toISOString();
    vState.rejectionReason = '';
    saveVerificationState(vState);
    showToast('⚡ [Admin Simulator] Emergency fast-track approval granted! Live demand broadcasting enabled.');
  });

  btnAdminReset?.addEventListener('click', () => {
    const vState = { ...DEFAULT_VERIFICATION };
    saveVerificationState(vState);
    if (adminRejectionReasonInput) adminRejectionReasonInput.value = '';
    if (verifOtpContainer) verifOtpContainer.hidden = true;
    if (otpSentIndicator) otpSentIndicator.style.display = 'none';
    showToast('↺ Verification state reset to Contact Pending.');
  });

  btnCreateDemandFromVerif?.addEventListener('click', () => {
    closeVerificationModal();
    openDemandModal();
  });

  btnCloseVerifView?.addEventListener('click', closeVerificationModal);

  // --- GATEKEEPING BUTTONS ---
  gateBtnProceed?.addEventListener('click', () => {
    closeGateModal();
    const vState = readVerificationState();
    openVerificationModal(vState.step || 1);
  });

  gateBtnEmergency?.addEventListener('click', openEmergencyModal);
  gateBtnCancel?.addEventListener('click', closeGateModal);

  // --- EMERGENCY REVIEW FORM ---
  emergencyForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    clearFormErrors(emergencyForm, emergencyFeedback);

    const title = (emergencyIncidentTitle?.value || '').trim();
    const justification = (emergencyJustification?.value || '').trim();

    let isValid = true;
    if (!title) { setFieldError('emergency-incident-title', 'Emergency incident title is required.'); isValid = false; }
    if (!justification) { setFieldError('emergency-justification', 'Justification is required for emergency intake.'); isValid = false; }

    if (!isValid) return;

    const vState = readVerificationState();
    vState.isEmergencyFastTrack = true;
    // In demo mode, emergency request fast-tracks shelter to Verified status immediately
    vState.status = 'Verified';
    vState.step = 3;
    vState.reviewedAt = new Date().toISOString();
    vState.rejectionReason = '';
    saveVerificationState(vState);

    closeEmergencyModal();
    showToast('⚡ Emergency review submitted & approved! Shelter granted active demand broadcasting.');

    // Immediately open demand alert modal so emergency alert can be published without friction
    window.setTimeout(openDemandModal, 400);
  });

  cancelEmergencyBtn?.addEventListener('click', closeEmergencyModal);

  // Topbar and Modal triggers
  topbarVerifBtn?.addEventListener('click', () => {
    const vState = readVerificationState();
    openVerificationModal(vState.step || 1);
  });

  document.querySelector('#close-verification-modal')?.addEventListener('click', closeVerificationModal);
  document.querySelector('#close-gate-modal')?.addEventListener('click', closeGateModal);
  document.querySelector('#close-emergency-modal')?.addEventListener('click', closeEmergencyModal);

  verifModal?.addEventListener('click', (e) => { if (e.target === verifModal) closeVerificationModal(); });
  verifGateModal?.addEventListener('click', (e) => { if (e.target === verifGateModal) closeGateModal(); });
  emergencyModal?.addEventListener('click', (e) => { if (e.target === emergencyModal) closeEmergencyModal(); });

  // --- EXISTING DASHBOARD LOGIC (DEMAND & INTAKE) ---
  function renderDashboard(state) {
    const shelterName = state.receiverProfile?.name || 'Harbor Shelter';
    const shelterDemands = (state.demands || []).filter(d => d.receiverId === shelterName || !d.receiverId || d.receiverId === 'Harbor Shelter');
    const openOrActive = shelterDemands.filter(d => d.status !== 'Delivered' && d.status !== 'Cancelled');
    const activeAssignments = (state.assignments || []).filter(a => a.receiverName === shelterName && a.status !== 'Delivered' && a.status !== 'Cancelled');

    // Metrics
    if (activeDemandCount) activeDemandCount.textContent = String(openOrActive.length).padStart(2, '0');
    if (activeDemandSub) activeDemandSub.textContent = activeAssignments.length > 0 ? `${activeAssignments.length} in transit/assigned` : 'open for matches';
    if (mealsConfirmedCount) mealsConfirmedCount.textContent = String(state.receiverProfile?.mealsConfirmed || 120);
    if (mealsConfirmedSub) mealsConfirmedSub.textContent = `expected by ${state.receiverProfile?.intakeWindow?.split('–')[1] || '7:30 PM'}`;
    if (intakeCapacityCount) intakeCapacityCount.textContent = String(state.receiverProfile?.intakeCapacity || 160);
    if (intakeCapacitySub) intakeCapacitySub.textContent = 'portions remaining';
    if (activeDemandFooter) activeDemandFooter.textContent = `${openOrActive.length} alert${openOrActive.length === 1 ? '' : 's'} active`;

    // Status Banner
    if (receiverStatusBanner) {
      if (activeAssignments.some(a => a.status === 'In Transit')) {
        receiverStatusBanner.innerHTML = `<span></span> <strong>LIVE HANDOFF:</strong> Volunteer rider is in transit with your supplies`;
      } else if (activeAssignments.some(a => a.status === 'Accepted' || a.status === 'Pending Acceptance')) {
        receiverStatusBanner.innerHTML = `<span></span> Supplier matched · Volunteer assignment active`;
      } else if (openOrActive.length > 0) {
        receiverStatusBanner.innerHTML = `<span></span> Active alert broadcasted to local kitchen network`;
      } else {
        receiverStatusBanner.innerHTML = `<span></span> Intake open · No active emergency alerts`;
      }
    }

    // Active in-transit tracking card
    if (trackingArea) {
      trackingArea.innerHTML = '';
      activeAssignments.forEach(asg => {
        const card = document.createElement('div');
        card.className = 'tracking-card';
        const isRecalc = asg.isRecalculated;
        card.innerHTML = `
          <div class="tracking-card-header">
            <b>${asg.status === 'In Transit' ? '🚚 RIDER IN TRANSIT' : '⏳ ASSIGNMENT RESERVED'} · ${escapeHtml(asg.quantity)} units</b>
            <span class="badge-tag ${asg.status === 'In Transit' ? 'live' : ''}">${escapeHtml(asg.status)}</span>
          </div>
          <p>
            Rider <strong>${escapeHtml(asg.riderName || 'Volunteer')}</strong> · Origin: ${escapeHtml(asg.pickupLocation)}<br/>
            Destination: <strong>${escapeHtml(asg.dropoffLocation)}</strong><br/>
            Cargo: ${escapeHtml(asg.category)} (${escapeHtml(asg.handlingRequirements || 'Safe handling')})
          </p>
          ${isRecalc ? `<div class="recalculation-alert" style="margin-top:10px;margin-bottom:0;"><b>Destination Notice:</b> ${escapeHtml(asg.recalculationReason || 'Rerouted')}</div>` : ''}
        `;
        trackingArea.appendChild(card);
      });
    }

    // Demand Alert List
    if (demandList) {
      demandList.innerHTML = '';
      if (shelterDemands.length === 0) {
        demandList.innerHTML = '<div class="empty-state">No demand alerts posted yet. Click below to create your first alert.</div>';
      } else {
        shelterDemands.forEach(alert => {
          const item = document.createElement('div');
          item.className = 'queue-item demand-alert-item';

          let statusClass = 'open';
          let statusBadgeText = alert.status.toUpperCase();
          if (alert.status === 'Delivered') statusClass = 'urgency-low';
          else if (alert.status === 'In Transit') statusClass = 'urgency-high';
          else if (alert.status === 'Matched') statusClass = 'urgency-medium';
          else if (alert.status === 'Cancelled') statusClass = 'urgency-critical';

          const canCancel = alert.status === 'Open' || alert.status === 'Matched' || alert.status === 'Partially Matched';

          item.innerHTML = `
            <div>
              <b>${escapeHtml(alert.category)} · ${escapeHtml(alert.quantity)} units</b>
              <small>${escapeHtml(alert.location)}<br />${escapeHtml(alert.reason || '')}</small>
              <small>Needed by: <strong>${escapeHtml(formatDeadline(alert.deadline))}</strong> · Remaining: ${alert.remainingQuantity} units</small>
            </div>
            <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
              <span class="queue-badge ${statusClass}">${escapeHtml(alert.urgency ? alert.urgency.toUpperCase() : '')}<br />${statusBadgeText}</span>
              ${canCancel ? `<button class="queue-action-btn secondary cancel-demand-btn" data-id="${escapeHtml(alert.id)}" type="button" title="Cancel or divert if emergency relocated">Divert / Cancel</button>` : ''}
            </div>
          `;
          demandList.appendChild(item);
        });
      }
    }

    // Bind cancel/divert buttons
    document.querySelectorAll('.cancel-demand-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (confirm('Are you sure you want to divert/cancel this demand request? If riders are in transit, destinations will be recalculated.')) {
          try {
            RelayStore.cancelDemandAlert(id, 'Harbor Shelter capacity reached or emergency relocated.');
            showToast('Demand alert cancelled. In-transit riders have been notified and destination recalculated.');
          } catch (err) {
            alert(err.message);
          }
        }
      });
    });

    // Update Checklist info from profile
    const chkEntrance = document.querySelector('#chk-entrance');
    if (chkEntrance && state.receiverProfile?.entrance) {
      chkEntrance.textContent = `Confirm entrance is open: ${state.receiverProfile.entrance}`;
    }
  }

  function setDeadlineMinimum() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const deadlineInput = document.querySelector('#demand-deadline');
    if (deadlineInput) {
      deadlineInput.min = now.toISOString().slice(0, 16);
      if (!deadlineInput.value) {
        const defaultDeadline = new Date(Date.now() + 3 * 3600 * 1000);
        defaultDeadline.setMinutes(defaultDeadline.getMinutes() - defaultDeadline.getTimezoneOffset());
        deadlineInput.value = defaultDeadline.toISOString().slice(0, 16);
      }
    }
  }

  function clearFormErrors(form, feedback) {
    if (!form) return;
    form.querySelectorAll('.demand-field').forEach((field) => field.classList.remove('has-error'));
    form.querySelectorAll('.field-error').forEach((error) => { error.textContent = ''; });
    if (feedback) {
      feedback.textContent = '';
      feedback.classList.remove('success');
    }
  }

  function setFieldError(id, message) {
    const elem = document.querySelector(`#${id}`);
    if (!elem) return;
    const field = elem.closest('.demand-field');
    const error = document.querySelector(`[data-error-for="${id}"]`);
    if (field) field.classList.add('has-error');
    if (error) error.textContent = message;
  }

  function validateDemandForm() {
    clearFormErrors(demandForm, demandFeedback);
    const formData = new FormData(demandForm);
    const values = Object.fromEntries(formData.entries());
    let isValid = true;

    const requiredFields = [
      ['demand-category', values.category, 'Choose a demand category.'],
      ['demand-quantity', values.quantity, 'Enter a quantity greater than zero.'],
      ['demand-location', values.location ? values.location.trim() : '', 'Enter the receiving location.'],
      ['demand-reason', values.reason ? values.reason.trim() : '', 'Explain why this request is urgent.'],
      ['demand-urgency', values.urgency, 'Choose an urgency level.'],
      ['demand-deadline', values.deadline, 'Choose a receiving deadline.']
    ];

    requiredFields.forEach(([id, value, message]) => {
      if (!value) {
        setFieldError(id, message);
        isValid = false;
      }
    });

    if (values.quantity && (!Number.isFinite(Number(values.quantity)) || Number(values.quantity) <= 0)) {
      setFieldError('demand-quantity', 'Quantity must be a positive number.');
      isValid = false;
    }

    if (values.deadline && new Date(values.deadline) <= new Date()) {
      setFieldError('demand-deadline', 'Deadline must be in the future.');
      isValid = false;
    }

    if (values.category === 'Other' && (!values.customCategory || !values.customCategory.trim())) {
      setFieldError('custom-category', 'Add a custom category name.');
      isValid = false;
    }

    if (!isValid && demandFeedback) {
      demandFeedback.textContent = 'Please fix the highlighted fields before submitting.';
    }

    return { isValid, values };
  }

  // --- GATEKEEPING: CREATE DEMAND ALERT ---
  function handleCreateDemandClick() {
    const vState = readVerificationState();
    if (vState.status === 'Verified') {
      openDemandModal();
    } else {
      openGateModal();
    }
  }

  function openDemandModal() {
    setDeadlineMinimum();
    clearFormErrors(demandForm, demandFeedback);
    demandModal.hidden = false;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => demandCategory?.focus(), 50);
  }

  function closeDemandModal() {
    if (isSubmittingDemand) return;
    demandModal.hidden = true;
    document.body.style.overflow = '';
    demandForm.reset();
    if (customCategoryField) customCategoryField.hidden = true;
    clearFormErrors(demandForm, demandFeedback);
  }

  // Intake Modal Handlers
  function openIntakeModal() {
    clearFormErrors(intakeForm, intakeFeedback);
    const state = RelayStore.getState();
    const prof = state.receiverProfile || {};
    if (intakeCapacityInput) intakeCapacityInput.value = prof.intakeCapacity || 160;
    if (intakeStatusSelect) intakeStatusSelect.value = prof.status || 'Intake Open';
    if (intakeWindowInput) intakeWindowInput.value = prof.intakeWindow || '6:45–7:30 PM';
    if (intakeEntranceInput) intakeEntranceInput.value = prof.entrance || 'South entrance · 4 volunteers ready';
    intakeModal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeIntakeModal() {
    if (isSubmittingIntake) return;
    intakeModal.hidden = true;
    document.body.style.overflow = '';
    clearFormErrors(intakeForm, intakeFeedback);
  }

  // Bind Event Listeners
  document.querySelector('#create-demand-alert')?.addEventListener('click', handleCreateDemandClick);
  document.querySelector('#close-demand-alert')?.addEventListener('click', closeDemandModal);
  document.querySelector('#cancel-demand-alert')?.addEventListener('click', closeDemandModal);
  demandModal?.addEventListener('click', (e) => { if (e.target === demandModal) closeDemandModal(); });

  document.querySelector('#update-intake-btn')?.addEventListener('click', openIntakeModal);
  document.querySelector('#close-intake-modal')?.addEventListener('click', closeIntakeModal);
  document.querySelector('#cancel-intake-modal')?.addEventListener('click', closeIntakeModal);
  intakeModal?.addEventListener('click', (e) => { if (e.target === intakeModal) closeIntakeModal(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (demandModal && !demandModal.hidden) closeDemandModal();
      if (intakeModal && !intakeModal.hidden) closeIntakeModal();
      if (verifModal && !verifModal.hidden) closeVerificationModal();
      if (verifGateModal && !verifGateModal.hidden) closeGateModal();
      if (emergencyModal && !emergencyModal.hidden) closeEmergencyModal();
    }
  });

  demandCategory?.addEventListener('change', () => {
    if (customCategoryField) {
      customCategoryField.hidden = demandCategory.value !== 'Other';
      if (customCategoryField.hidden && customCategory) customCategory.value = '';
    }
  });

  demandForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (isSubmittingDemand) return;

    // Double check verification
    const vState = readVerificationState();
    if (vState.status !== 'Verified') {
      closeDemandModal();
      openGateModal();
      return;
    }

    const { isValid, values } = validateDemandForm();
    if (!isValid) return;

    isSubmittingDemand = true;
    submitDemandButton.disabled = true;
    submitDemandLabel.textContent = 'Publishing alert…';
    if (demandFeedback) demandFeedback.textContent = 'Connecting with supplier network…';

    window.setTimeout(() => {
      try {
        const finalCategory = values.category === 'Other' ? values.customCategory.trim() : values.category;
        const alert = RelayStore.createDemandAlert({
          category: finalCategory,
          quantity: Number(values.quantity),
          location: values.location.trim(),
          reason: values.reason.trim(),
          urgency: values.urgency,
          deadline: values.deadline
        });

        isSubmittingDemand = false;
        submitDemandButton.disabled = false;
        submitDemandLabel.textContent = 'Create demand alert';
        closeDemandModal();
        showToast(`Demand alert published for ${alert.category} (${alert.quantity} units). Visible to suppliers.`);
      } catch (err) {
        isSubmittingDemand = false;
        submitDemandButton.disabled = false;
        submitDemandLabel.textContent = 'Create demand alert';
        if (demandFeedback) demandFeedback.textContent = err.message;
      }
    }, 350);
  });

  intakeForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (isSubmittingIntake) return;
    clearFormErrors(intakeForm, intakeFeedback);

    const capacity = Number(intakeCapacityInput.value);
    if (!Number.isFinite(capacity) || capacity < 0) {
      setFieldError('intake-capacity-input', 'Enter a valid non-negative capacity.');
      return;
    }
    if (!intakeWindowInput.value.trim()) {
      setFieldError('intake-window-input', 'Enter an intake window.');
      return;
    }

    isSubmittingIntake = true;
    if (submitIntakeBtn) submitIntakeBtn.disabled = true;

    try {
      RelayStore.updateReceiverIntake({
        intakeCapacity: capacity,
        intakeWindow: intakeWindowInput.value.trim(),
        entrance: intakeEntranceInput.value.trim(),
        status: intakeStatusSelect.value
      });

      isSubmittingIntake = false;
      if (submitIntakeBtn) submitIntakeBtn.disabled = false;
      closeIntakeModal();
      showToast('Intake window & capacity updated successfully.');
    } catch (err) {
      isSubmittingIntake = false;
      if (submitIntakeBtn) submitIntakeBtn.disabled = false;
      if (intakeFeedback) intakeFeedback.textContent = err.message;
    }
  });

  // Initial load
  const initialVerification = readVerificationState();
  updateVerificationUI(initialVerification);

  // Subscribe to live store updates
  RelayStore.subscribe(renderDashboard);
})();
