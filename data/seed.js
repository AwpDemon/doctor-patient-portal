/**
 * Seed Script - Populates the database with realistic demo data
 *
 * Run with: npm run seed
 *
 * Creates:
 * - 1 admin, 4 doctors, 6 patients
 * - Appointments spanning past and future dates
 * - Messages between doctors and patients
 * - Prescriptions with various statuses
 * - Lab results with normal and abnormal values
 * - Billing records
 * - Notifications
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const path = require('path');

// Set DB path before importing
process.env.DB_PATH = process.env.DB_PATH || path.join(__dirname, 'portal.db');

const { getDatabase, closeDatabase } = require('../config/db');

async function seed() {
  console.log('Seeding database...\n');

  const db = getDatabase();

  // Clear existing data
  const tables = ['notifications', 'billing', 'lab_results', 'prescriptions', 'messages', 'appointments', 'audit_log', 'users'];
  for (const table of tables) {
    db.prepare(`DELETE FROM ${table}`).run();
    db.prepare(`DELETE FROM sqlite_sequence WHERE name = '${table}'`).run();
  }

  // ============================================================
  // Users
  // ============================================================
  const password = await bcrypt.hash('Password123', 12);

  const insertUser = db.prepare(`
    INSERT INTO users (email, password, first_name, last_name, role, phone,
                       date_of_birth, gender, address, specialty, license_number,
                       insurance_id, emergency_contact, emergency_phone, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  // Admin
  insertUser.run('admin@healthbridge.com', password, 'System', 'Administrator', 'admin',
    '706-555-0100', '1985-03-15', 'Male', '100 Admin Way, Athens, GA 30602',
    null, null, null, null, null);

  // Doctors
  const doctors = [
    ['dr.chen@healthbridge.com', 'Sarah', 'Chen', '706-555-0201', '1978-06-22', 'Female',
      '201 Medical Dr, Athens, GA 30601', 'Cardiology', 'GA-MD-44521', null, 'James Chen', '706-555-0299'],
    ['dr.patel@healthbridge.com', 'Raj', 'Patel', '706-555-0202', '1982-11-08', 'Male',
      '202 Medical Dr, Athens, GA 30601', 'Family Medicine', 'GA-MD-55834', null, 'Priya Patel', '706-555-0298'],
    ['dr.johnson@healthbridge.com', 'Michael', 'Johnson', '706-555-0203', '1975-01-30', 'Male',
      '203 Medical Dr, Athens, GA 30601', 'Orthopedics', 'GA-MD-33219', null, 'Lisa Johnson', '706-555-0297'],
    ['dr.williams@healthbridge.com', 'Emily', 'Williams', '706-555-0204', '1980-09-14', 'Female',
      '204 Medical Dr, Athens, GA 30601', 'Dermatology', 'GA-MD-66742', null, 'Robert Williams', '706-555-0296'],
  ];

  for (const doc of doctors) {
    insertUser.run(doc[0], password, doc[1], doc[2], 'doctor', ...doc.slice(3));
  }

  // Patients
  const patients = [
    ['john.doe@email.com', 'John', 'Doe', '706-555-0301', '1990-05-12', 'Male',
      '301 Patient Ln, Athens, GA 30605', null, null, 'INS-7789001', 'Jane Doe', '706-555-0399'],
    ['mary.smith@email.com', 'Mary', 'Smith', '706-555-0302', '1988-08-23', 'Female',
      '302 Patient Ln, Athens, GA 30605', null, null, 'INS-7789002', 'Tom Smith', '706-555-0398'],
    ['david.wilson@email.com', 'David', 'Wilson', '706-555-0303', '1995-02-14', 'Male',
      '303 Patient Ln, Athens, GA 30605', null, null, 'INS-7789003', 'Carol Wilson', '706-555-0397'],
    ['lisa.brown@email.com', 'Lisa', 'Brown', '706-555-0304', '1992-12-01', 'Female',
      '304 Patient Ln, Athens, GA 30605', null, null, 'INS-7789004', 'Mark Brown', '706-555-0396'],
    ['james.taylor@email.com', 'James', 'Taylor', '706-555-0305', '1987-07-19', 'Male',
      '305 Patient Ln, Athens, GA 30605', null, null, 'INS-7789005', 'Susan Taylor', '706-555-0395'],
    ['emma.garcia@email.com', 'Emma', 'Garcia', '706-555-0306', '1993-04-28', 'Female',
      '306 Patient Ln, Athens, GA 30605', null, null, 'INS-7789006', 'Carlos Garcia', '706-555-0394'],
  ];

  for (const pat of patients) {
    insertUser.run(pat[0], password, pat[1], pat[2], 'patient', ...pat.slice(3));
  }

  console.log('  Users created: 1 admin, 4 doctors, 6 patients');

  // ============================================================
  // Appointments
  // ============================================================
  const insertAppointment = db.prepare(`
    INSERT INTO appointments (patient_id, doctor_id, date, time, duration, type, status, reason, notes, location)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Helper: generate dates relative to today
  function dateOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  const appointmentData = [
    // Past appointments (completed)
    [6, 2, dateOffset(-30), '09:00', 30, 'checkup', 'completed', 'Annual physical', 'All vitals normal. Recommended follow-up in 6 months.', 'Main Office'],
    [7, 2, dateOffset(-25), '10:00', 30, 'checkup', 'completed', 'Persistent headaches', 'Prescribed ibuprofen. Ordered blood work.', 'Main Office'],
    [8, 3, dateOffset(-20), '14:00', 45, 'consultation', 'completed', 'Knee pain evaluation', 'MRI recommended. Possible ligament strain.', 'Orthopedic Suite'],
    [9, 4, dateOffset(-15), '11:00', 30, 'checkup', 'completed', 'Skin rash follow-up', 'Rash clearing with prescribed cream. Continue treatment.', 'Dermatology Clinic'],
    [6, 3, dateOffset(-10), '15:00', 30, 'follow-up', 'completed', 'Blood pressure follow-up', 'BP normalized with medication. Continue current regimen.', 'Main Office'],
    [10, 2, dateOffset(-8), '09:30', 30, 'checkup', 'completed', 'Annual checkup', 'Good health overall. Vitamin D levels slightly low.', 'Main Office'],
    [11, 5, dateOffset(-5), '13:00', 30, 'checkup', 'completed', 'Acne consultation', 'Prescribed topical retinoid. Follow up in 4 weeks.', 'Dermatology Clinic'],

    // Upcoming appointments
    [6, 2, dateOffset(1), '09:00', 30, 'follow-up', 'confirmed', 'Blood work results review', null, 'Main Office'],
    [7, 3, dateOffset(2), '10:30', 45, 'procedure', 'scheduled', 'Knee MRI', null, 'Imaging Center'],
    [8, 2, dateOffset(3), '14:00', 30, 'checkup', 'scheduled', 'General checkup', null, 'Main Office'],
    [9, 5, dateOffset(4), '11:00', 30, 'follow-up', 'confirmed', 'Skin treatment follow-up', null, 'Dermatology Clinic'],
    [10, 3, dateOffset(5), '09:00', 30, 'consultation', 'scheduled', 'Back pain evaluation', null, 'Orthopedic Suite'],
    [11, 2, dateOffset(7), '15:30', 30, 'checkup', 'scheduled', 'Wellness visit', null, 'Main Office'],
    [6, 4, dateOffset(10), '10:00', 60, 'procedure', 'scheduled', 'Cardiac stress test', null, 'Cardiology Lab'],
    [7, 2, dateOffset(14), '11:00', 30, 'follow-up', 'scheduled', 'MRI results review', null, 'Main Office'],

    // Cancelled
    [8, 4, dateOffset(-3), '16:00', 30, 'checkup', 'cancelled', 'Routine check', 'Patient cancelled - scheduling conflict.', 'Main Office'],
  ];

  for (const appt of appointmentData) {
    insertAppointment.run(...appt);
  }

  console.log(`  Appointments created: ${appointmentData.length}`);

  // ============================================================
  // Prescriptions
  // ============================================================
  const insertPrescription = db.prepare(`
    INSERT INTO prescriptions (patient_id, doctor_id, medication, dosage, frequency,
                                start_date, end_date, refills_remaining, refills_total,
                                status, pharmacy, instructions, side_effects)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const prescriptionData = [
    [6, 2, 'Lisinopril', '10mg', 'Once daily', dateOffset(-30), null, 3, 3,
      'active', 'CVS Pharmacy - Athens', 'Take in the morning with water. Monitor blood pressure.',
      'Dizziness, dry cough, headache'],
    [6, 2, 'Atorvastatin', '20mg', 'Once daily at bedtime', dateOffset(-30), null, 5, 6,
      'active', 'CVS Pharmacy - Athens', 'Take at bedtime. Avoid grapefruit.',
      'Muscle pain, digestive issues'],
    [7, 2, 'Ibuprofen', '400mg', 'Every 6 hours as needed', dateOffset(-25), dateOffset(-11), 0, 0,
      'completed', 'Walgreens - Athens', 'Take with food. Do not exceed 4 doses per day.',
      'Stomach upset, nausea'],
    [8, 3, 'Naproxen', '500mg', 'Twice daily', dateOffset(-20), dateOffset(10), 1, 2,
      'active', 'Kroger Pharmacy - Athens', 'Take with meals. For knee inflammation.',
      'Stomach discomfort, dizziness'],
    [9, 5, 'Hydrocortisone Cream', '1%', 'Apply twice daily to affected area', dateOffset(-15), dateOffset(-1), 0, 0,
      'completed', 'CVS Pharmacy - Athens', 'Apply thin layer. Wash hands after application.',
      'Skin thinning with prolonged use'],
    [10, 2, 'Vitamin D3', '2000 IU', 'Once daily', dateOffset(-8), null, 2, 2,
      'active', 'Walgreens - Athens', 'Take with a meal containing fat for best absorption.',
      'Rare at recommended doses'],
    [11, 5, 'Tretinoin Cream', '0.025%', 'Apply once nightly', dateOffset(-5), dateOffset(85), 1, 1,
      'active', 'CVS Pharmacy - Athens', 'Apply pea-sized amount at night. Use sunscreen during the day.',
      'Skin dryness, peeling, sun sensitivity'],
    [6, 4, 'Aspirin', '81mg', 'Once daily', dateOffset(-60), null, 4, 6,
      'active', 'CVS Pharmacy - Athens', 'Low-dose aspirin for cardiovascular health.',
      'Stomach irritation, easy bruising'],
  ];

  for (const rx of prescriptionData) {
    insertPrescription.run(...rx);
  }

  console.log(`  Prescriptions created: ${prescriptionData.length}`);

  // ============================================================
  // Lab Results
  // ============================================================
  const insertLabResult = db.prepare(`
    INSERT INTO lab_results (patient_id, doctor_id, test_name, category, result_value,
                              reference_range, unit, status, notes, test_date, result_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const labData = [
    // John Doe's labs
    [6, 2, 'Complete Blood Count (CBC)', 'Hematology', 'WBC: 7.2, RBC: 4.8, Hgb: 14.5', 'WBC: 4.5-11.0, RBC: 4.5-5.5, Hgb: 13.5-17.5', 'K/uL, M/uL, g/dL', 'normal', 'All values within normal range.', dateOffset(-28), dateOffset(-27)],
    [6, 2, 'Lipid Panel', 'Chemistry', 'Total: 215, LDL: 140, HDL: 45, Trig: 150', 'Total: <200, LDL: <100, HDL: >40, Trig: <150', 'mg/dL', 'abnormal', 'LDL elevated. Started on atorvastatin. Recheck in 3 months.', dateOffset(-28), dateOffset(-27)],
    [6, 2, 'Blood Glucose (Fasting)', 'Chemistry', '95', '70-100', 'mg/dL', 'normal', 'Fasting glucose normal.', dateOffset(-28), dateOffset(-27)],
    [6, 2, 'Blood Pressure Monitoring', 'Vitals', '138/88', '<120/80', 'mmHg', 'abnormal', 'Stage 1 hypertension. Started on lisinopril.', dateOffset(-28), dateOffset(-28)],

    // Mary Smith's labs
    [7, 2, 'Thyroid Panel', 'Endocrine', 'TSH: 2.5, T4: 1.2', 'TSH: 0.4-4.0, T4: 0.8-1.8', 'mIU/L, ng/dL', 'normal', 'Thyroid function normal.', dateOffset(-23), dateOffset(-22)],
    [7, 2, 'Vitamin B12', 'Chemistry', '450', '200-900', 'pg/mL', 'normal', 'B12 levels adequate.', dateOffset(-23), dateOffset(-22)],

    // David Wilson's labs
    [8, 3, 'MRI - Right Knee', 'Imaging', 'Mild ACL sprain, no meniscal tear', 'Normal ligament integrity', 'N/A', 'abnormal', 'Grade 1 ACL sprain. Conservative treatment recommended.', dateOffset(-18), dateOffset(-16)],
    [8, 3, 'Erythrocyte Sedimentation Rate', 'Hematology', '22', '0-20', 'mm/hr', 'abnormal', 'Slightly elevated, consistent with mild inflammation.', dateOffset(-18), dateOffset(-17)],

    // James Taylor's labs
    [10, 2, 'Vitamin D, 25-Hydroxy', 'Chemistry', '18', '30-100', 'ng/mL', 'abnormal', 'Vitamin D deficiency. Supplement recommended.', dateOffset(-6), dateOffset(-5)],
    [10, 2, 'Metabolic Panel', 'Chemistry', 'Glucose: 92, BUN: 15, Creatinine: 1.0', 'Glucose: 70-100, BUN: 7-20, Creatinine: 0.7-1.3', 'mg/dL', 'normal', 'All values within normal range.', dateOffset(-6), dateOffset(-5)],

    // Pending lab result
    [6, 2, 'Lipid Panel (Follow-up)', 'Chemistry', 'Pending', 'Total: <200, LDL: <100', 'mg/dL', 'pending', 'Follow-up lipid panel to check atorvastatin effectiveness.', dateOffset(1), null],
  ];

  for (const lab of labData) {
    insertLabResult.run(...lab);
  }

  console.log(`  Lab results created: ${labData.length}`);

  // ============================================================
  // Billing
  // ============================================================
  const insertBilling = db.prepare(`
    INSERT INTO billing (patient_id, appointment_id, description, amount,
                          insurance_covered, patient_responsibility, status,
                          due_date, paid_date, payment_method, invoice_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const billingData = [
    [6, 1, 'Annual Physical Examination', 250.00, 200.00, 50.00, 'paid', dateOffset(-1), dateOffset(-5), 'credit_card', 'INV-2025-001'],
    [7, 2, 'Office Visit - Headache Evaluation', 175.00, 140.00, 35.00, 'paid', dateOffset(5), dateOffset(-3), 'insurance', 'INV-2025-002'],
    [8, 3, 'Orthopedic Consultation', 350.00, 280.00, 70.00, 'pending', dateOffset(10), null, null, 'INV-2025-003'],
    [9, 4, 'Dermatology Follow-up', 150.00, 120.00, 30.00, 'paid', dateOffset(-1), dateOffset(-2), 'debit_card', 'INV-2025-004'],
    [6, 5, 'Blood Pressure Follow-up', 125.00, 100.00, 25.00, 'pending', dateOffset(20), null, null, 'INV-2025-005'],
    [10, 6, 'Annual Checkup', 250.00, 225.00, 25.00, 'insurance_processing', dateOffset(30), null, null, 'INV-2025-006'],
    [8, null, 'MRI - Right Knee', 1200.00, 960.00, 240.00, 'overdue', dateOffset(-5), null, null, 'INV-2025-007'],
    [6, null, 'Laboratory Panel - Lipid + CBC', 180.00, 144.00, 36.00, 'paid', dateOffset(-10), dateOffset(-15), 'credit_card', 'INV-2025-008'],
    [11, 7, 'Dermatology Consultation - Acne', 200.00, 160.00, 40.00, 'pending', dateOffset(15), null, null, 'INV-2025-009'],
  ];

  for (const bill of billingData) {
    insertBilling.run(...bill);
  }

  console.log(`  Billing records created: ${billingData.length}`);

  // ============================================================
  // Messages
  // ============================================================
  const insertMessage = db.prepare(`
    INSERT INTO messages (sender_id, recipient_id, subject, body, is_read, is_urgent, parent_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ?))
  `);

  const messageData = [
    [2, 6, 'Blood Work Results', 'Hi John,\n\nYour recent blood work results are in. Your lipid panel shows elevated LDL cholesterol (140 mg/dL). I\'ve prescribed atorvastatin to help manage this. We should do a follow-up panel in 3 months.\n\nYour CBC and glucose levels are all within normal range, which is great.\n\nPlease don\'t hesitate to reach out if you have any questions about your new medication.\n\nBest,\nDr. Chen', 1, 0, null, '-5 days'],
    [6, 2, 'Re: Blood Work Results', 'Thank you Dr. Chen. I\'ve picked up the prescription from CVS. Should I be concerned about any dietary changes alongside the medication?\n\nThanks,\nJohn', 1, 0, 1, '-4 days'],
    [2, 6, 'Re: Blood Work Results', 'Great question, John. I recommend reducing saturated fats and increasing fiber intake. Try to include more fish, nuts, and whole grains in your diet. We\'ll see how the numbers look at your follow-up.\n\nDr. Chen', 0, 0, 1, '-3 days'],

    [3, 8, 'MRI Results - Right Knee', 'David,\n\nYour MRI results show a Grade 1 ACL sprain. The good news is there\'s no meniscal tear. I recommend conservative treatment with physical therapy and the naproxen I\'ve prescribed.\n\nPlease schedule a follow-up in 4 weeks so we can assess your progress.\n\nDr. Johnson', 1, 0, null, '-4 days'],
    [8, 3, 'Re: MRI Results - Right Knee', 'Dr. Johnson, thanks for the update. Should I avoid any specific activities during recovery? I usually run 3 times a week.\n\nDavid', 0, 0, 4, '-3 days'],

    [5, 9, 'Treatment Progress', 'Hi Lisa,\n\nGlad to hear the hydrocortisone is helping with the rash. Keep applying as directed for the remaining treatment period. Your follow-up is scheduled for next week.\n\nDr. Williams', 1, 0, null, '-2 days'],

    [2, 10, 'Vitamin D Supplement', 'James,\n\nAs discussed, your Vitamin D levels are below the recommended range at 18 ng/mL. I\'ve prescribed Vitamin D3 2000 IU daily. Make sure to take it with a meal for better absorption.\n\nWe\'ll recheck levels in 3 months.\n\nDr. Patel', 0, 0, null, '-1 days'],

    [6, 4, 'Question About Stress Test', 'Dr. Chen,\n\nI have my cardiac stress test coming up next week. Are there any preparations I need to make beforehand? Should I fast or stop any medications?\n\nThanks,\nJohn', 0, 1, null, '-1 days'],
  ];

  for (const msg of messageData) {
    insertMessage.run(...msg);
  }

  console.log(`  Messages created: ${messageData.length}`);

  // ============================================================
  // Notifications
  // ============================================================
  const insertNotification = db.prepare(`
    INSERT INTO notifications (user_id, type, title, message, is_read, link, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?))
  `);

  const notificationData = [
    [6, 'appointment', 'Upcoming Appointment', 'You have an appointment with Dr. Chen tomorrow at 9:00 AM.', 0, '/appointments', '-1 days'],
    [6, 'lab_result', 'Lab Results Available', 'Your lipid panel results are now available for review.', 1, '/lab-results', '-5 days'],
    [6, 'prescription', 'New Prescription', 'Dr. Chen prescribed Atorvastatin 20mg.', 1, '/prescriptions', '-5 days'],
    [6, 'billing', 'Payment Due', 'Invoice INV-2025-005 for $25.00 is due in 20 days.', 0, '/billing', '-1 days'],
    [2, 'appointment', 'New Appointment', 'John Doe booked a follow-up on ' + dateOffset(1) + ' at 9:00 AM.', 0, '/appointments', '-2 days'],
    [2, 'message', 'Urgent Message', 'John Doe: Question About Stress Test', 0, '/messages', '-1 days'],
    [7, 'appointment', 'Appointment Reminder', 'Your knee MRI is scheduled with Dr. Johnson in 2 days.', 0, '/appointments', '-1 days'],
    [8, 'lab_result', 'MRI Results Available', 'Your right knee MRI results are ready for review.', 1, '/lab-results', '-4 days'],
    [10, 'prescription', 'New Prescription', 'Dr. Patel prescribed Vitamin D3 2000 IU.', 0, '/prescriptions', '-1 days'],
    [3, 'message', 'New Message', 'David Wilson replied to: MRI Results - Right Knee', 0, '/messages', '-3 days'],
  ];

  for (const notif of notificationData) {
    insertNotification.run(...notif);
  }

  console.log(`  Notifications created: ${notificationData.length}`);

  // ============================================================
  // Summary
  // ============================================================
  console.log('\n  Seed complete!\n');
  console.log('  ===== Demo Login Credentials =====');
  console.log('  All accounts use password: Password123\n');
  console.log('  Admin:   admin@healthbridge.com');
  console.log('  Doctor:  dr.chen@healthbridge.com');
  console.log('  Doctor:  dr.patel@healthbridge.com');
  console.log('  Doctor:  dr.johnson@healthbridge.com');
  console.log('  Doctor:  dr.williams@healthbridge.com');
  console.log('  Patient: john.doe@email.com');
  console.log('  Patient: mary.smith@email.com');
  console.log('  Patient: david.wilson@email.com');
  console.log('  Patient: lisa.brown@email.com');
  console.log('  Patient: james.taylor@email.com');
  console.log('  Patient: emma.garcia@email.com');
  console.log('  ====================================\n');

  closeDatabase();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
