-- Demo seed for PayChase D1
DELETE FROM InvoiceEvent;
DELETE FROM FollowUp;
DELETE FROM PaymentPromise;
DELETE FROM InvoiceExtraction;
DELETE FROM Invoice;
DELETE FROM Customer;
DELETE FROM Workspace;
DELETE FROM User;

INSERT INTO User (id, email, name, createdAt) VALUES
('user_demo', 'demo@paychase.app', 'Alex Rivera', datetime('now'));

INSERT INTO Workspace (id, name, ownerId, createdAt) VALUES
('ws_demo', 'Rivera Studio', 'user_demo', datetime('now'));

INSERT INTO Customer (id, workspaceId, name, companyName, email, notes, paymentBehavior, createdAt, updatedAt) VALUES
('cust_abc', 'ws_demo', 'Sokha Meas', 'ABC Logistics', 'ap@abclogistics.example', 'Usually pays after second reminder.', 'FREQUENTLY_LATE', datetime('now'), datetime('now')),
('cust_dara', 'ws_demo', 'Dara Chen', 'Dara Studio', 'dara@darastudio.example', NULL, 'SOMETIMES_LATE', datetime('now'), datetime('now')),
('cust_mekong', 'ws_demo', 'Vannak Lim', 'Mekong Supplies', 'billing@mekongsupplies.example', 'Promised payment soon.', 'USUALLY_ON_TIME', datetime('now'), datetime('now')),
('cust_sovan', 'ws_demo', 'Sovan Keo', 'Sovan Agency', 'finance@sovanagency.example', NULL, 'USUALLY_ON_TIME', datetime('now'), datetime('now')),
('cust_phnom', 'ws_demo', 'Rithy Phan', 'Phnom Creative', 'rithy@phnomcreative.example', NULL, 'SOMETIMES_LATE', datetime('now'), datetime('now')),
('cust_orbit', 'ws_demo', 'Maya Ortiz', 'Orbit Software', 'ap@orbitsoftware.example', NULL, 'UNKNOWN', datetime('now'), datetime('now'));

-- Relative dates using SQLite date modifiers
INSERT INTO Invoice (id, workspaceId, customerId, invoiceNumber, issueDate, dueDate, currency, subtotal, tax, totalAmount, amountOutstanding, status, daysOverdue, priorityScore, notes, lastFollowUpAt, nextFollowUpAt, paidAt, createdAt, updatedAt) VALUES
('inv_104', 'ws_demo', 'cust_abc', '104', date('now','-35 day'), date('now','-21 day'), 'USD', 1090.91, 109.09, 1200, 1200, 'OVERDUE', 21, 45, NULL, date('now','-6 day'), NULL, NULL, datetime('now'), datetime('now')),
('inv_108', 'ws_demo', 'cust_abc', '108', date('now','-22 day'), date('now','-8 day'), 'USD', 1363.64, 136.36, 1500, 1500, 'OVERDUE', 8, 47, NULL, NULL, NULL, NULL, datetime('now'), datetime('now')),
('inv_211', 'ws_demo', 'cust_dara', '211', date('now','-26 day'), date('now','-12 day'), 'USD', 772.73, 77.27, 850, 850, 'OVERDUE', 12, 42, NULL, NULL, NULL, NULL, datetime('now'), datetime('now')),
('inv_330', 'ws_demo', 'cust_mekong', '330', date('now','-28 day'), date('now','-10 day'), 'USD', 2181.82, 218.18, 2400, 2400, 'PROMISED', 10, 30, NULL, date('now','-2 day'), date('now','+1 day'), NULL, datetime('now'), datetime('now')),
('inv_415', 'ws_demo', 'cust_sovan', '415', date('now','-10 day'), date('now','+3 day'), 'USD', 545.45, 54.55, 600, 600, 'DUE_SOON', 0, 10, NULL, NULL, NULL, NULL, datetime('now'), datetime('now')),
('inv_502', 'ws_demo', 'cust_phnom', '502', date('now','-45 day'), date('now','-31 day'), 'USD', 890.91, 89.09, 980, 980, 'OVERDUE', 31, 55, NULL, date('now','-15 day'), NULL, NULL, datetime('now'), datetime('now')),
('inv_618', 'ws_demo', 'cust_orbit', '618', date('now','-18 day'), date('now'), 'USD', 1318.18, 131.82, 1450, 1450, 'DUE_TODAY', 0, 22, NULL, NULL, NULL, NULL, datetime('now'), datetime('now')),
('inv_601', 'ws_demo', 'cust_orbit', '601', date('now','-60 day'), date('now','-40 day'), 'USD', 2000, 200, 2200, 0, 'PAID', 0, -2000, NULL, NULL, NULL, date('now','-5 day'), datetime('now'), datetime('now')),
('inv_401', 'ws_demo', 'cust_sovan', '401', date('now','-50 day'), date('now','-35 day'), 'USD', 1090.91, 109.09, 1200, 0, 'PAID', 0, -2000, NULL, NULL, NULL, date('now','-12 day'), datetime('now'), datetime('now')),
('inv_490', 'ws_demo', 'cust_phnom', '490', date('now','-40 day'), date('now','-20 day'), 'USD', 636.36, 63.64, 700, 700, 'DISPUTED', 20, -1000, 'Customer disputes line item on design revisions.', NULL, NULL, NULL, datetime('now'), datetime('now'));

INSERT INTO PaymentPromise (id, invoiceId, promisedDate, promisedAmount, status, notes, createdAt, updatedAt) VALUES
('prom_330', 'inv_330', date('now','+1 day'), 2400, 'ACTIVE', 'Customer confirmed via email.', datetime('now'), datetime('now'));

INSERT INTO FollowUp (id, invoiceId, type, tone, subject, message, status, sentAt, createdAt) VALUES
('fu_104', 'inv_104', 'REMINDER', 'PROFESSIONAL', 'Payment reminder for Invoice #104', 'Following up on Invoice #104.', 'SENT', date('now','-6 day'), date('now','-6 day')),
('fu_502', 'inv_502', 'REMINDER', 'PROFESSIONAL', 'Payment reminder for Invoice #502', 'Following up on Invoice #502.', 'SENT', date('now','-15 day'), date('now','-15 day'));

INSERT INTO InvoiceEvent (id, invoiceId, type, metadata, createdAt) VALUES
('ev_104u', 'inv_104', 'INVOICE_UPLOADED', '{"source":"seed"}', datetime('now')),
('ev_104s', 'inv_104', 'REMINDER_SENT', '{}', date('now','-6 day')),
('ev_330p', 'inv_330', 'PROMISE_RECORDED', '{}', datetime('now')),
('ev_490d', 'inv_490', 'MARKED_DISPUTED', '{}', datetime('now')),
('ev_601p', 'inv_601', 'MARKED_PAID', '{}', date('now','-5 day'));
