/**
 * =========================================================================
 * দামের খাতা (Damer Khata) - Google Apps Script Sync & Backup Backend
 * =========================================================================
 * 
 * কিভাবে Deploy করবেন:
 * ১. script.google.com এ যান এবং "New project" খুলুন।
 * ২. এই পুরো কোডটি Code.gs ফাইলে পেস্ট করুন এবং সেভ করুন।
 * ৩. উপরে ডানদিকের "Deploy" বাটনে চাপ দিয়ে "New deployment" বেছে নিন।
 * ৪. Select type: "Web app"
 *    - Description: Damer Khata Sync API
 *    - Execute as: Me (আপনার Google একাউন্ট)
 *    - Who has access: Anyone (যেকোনো কেউ)
 * ৫. "Deploy" চাপুন। প্রয়োজনে Google Drive অ্যাক্সেস পারমিশন দিন।
 * ৬. প্রাপ্ত Web App URL টি কপি করে দামের খাতা অ্যাপের সেটিংসের 
 *    "Apps Script Web App লিংক" ঘরে বসিয়ে দিন।
 */

var FOLDER_NAME = "Dokan Backup";
var MASTER_FILE_NAME = "master_data.json";

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    message: "দামের খাতা গুগল ড্রাইভ ব্যাকআপ সার্ভার সচল আছে।"
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // Acquire lock for up to 30 seconds to handle concurrent requests safely
    lock.waitLock(30000);
  } catch (err) {
    return respond({ status: "error", message: "সার্ভার ব্যস্ত আছে, অনুগ্রহ করে কিছুক্ষণ পর চেষ্টা করুন।" });
  }

  try {
    var raw = e.postData ? e.postData.contents : "";
    if (!raw) {
      return respond({ status: "error", message: "কোনো ডাটা পাঠানো হয়নি।" });
    }

    var req = JSON.parse(raw);
    var action = req.action || "sync";
    var clientCode = (req.code || "").toString().trim();

    if (!clientCode) {
      return respond({ status: "error", message: "দোকানের ৮ সংখ্যার কোড প্রয়োজন।" });
    }

    // Verify or register store code
    var props = PropertiesService.getScriptProperties();
    var registeredCode = props.getProperty("STORE_CODE");

    if (!registeredCode) {
      props.setProperty("STORE_CODE", clientCode);
      registeredCode = clientCode;
    } else if (registeredCode !== clientCode) {
      return respond({ status: "error", message: "দোকানের কোড মেলেনি! অনুগ্রহ করে সঠিক ৮ সংখ্যার কোড দিন।" });
    }

    // Get or create Dokan Backup folder
    var folder = getOrCreateFolder(FOLDER_NAME);
    var masterFile = getOrCreateMasterFile(folder);
    var masterData = loadMasterData(masterFile);

    var now = new Date().getTime();

    if (action === "pull") {
      // Full sync / initial pull for a new phone
      return respond({
        status: "ok",
        serverTime: now,
        delta: masterData
      });
    }

    if (action === "sync") {
      var since = req.since || 0;
      var changes = req.changes || {};

      // 1. Merge Tombstones
      if (changes.tomb) {
        if (!masterData.tomb) masterData.tomb = {};
        for (var tId in changes.tomb) {
          masterData.tomb[tId] = Math.max(masterData.tomb[tId] || 0, changes.tomb[tId]);
        }
      }

      // 2. Merge Sales (Append-only / unique ID list merge)
      // Sales made concurrently on Phone A and Phone B are BOTH preserved!
      if (changes.sales && changes.sales.length > 0) {
        if (!masterData.sales) masterData.sales = [];
        changes.sales.forEach(function (sale) {
          var exists = false;
          for (var i = 0; i < masterData.sales.length; i++) {
            if (masterData.sales[i].id === sale.id) {
              exists = true;
              if ((sale.u || 0) > (masterData.sales[i].u || 0)) {
                masterData.sales[i] = sale;
              }
              break;
            }
          }
          if (!exists) {
            sale.su = now;
            masterData.sales.push(sale);
          }
        });
      }

      // 3. Merge Items (Last-write-wins by timestamp u)
      if (changes.items && changes.items.length > 0) {
        if (!masterData.items) masterData.items = [];
        changes.items.forEach(function (item) {
          if (masterData.tomb && masterData.tomb[item.id] && masterData.tomb[item.id] >= (item.u || 0)) {
            return; // Deleted
          }
          var exists = false;
          for (var i = 0; i < masterData.items.length; i++) {
            if (masterData.items[i].id === item.id) {
              exists = true;
              if ((item.u || 0) > (masterData.items[i].u || 0)) {
                item.su = now;
                masterData.items[i] = item;
              }
              break;
            }
          }
          if (!exists) {
            item.su = now;
            masterData.items.push(item);
          }
        });
      }

      // 4. Merge Trips (Batches)
      if (changes.trips && changes.trips.length > 0) {
        if (!masterData.trips) masterData.trips = [];
        changes.trips.forEach(function (trip) {
          if (masterData.tomb && masterData.tomb[trip.id] && masterData.tomb[trip.id] >= (trip.u || 0)) return;
          var exists = false;
          for (var i = 0; i < masterData.trips.length; i++) {
            if (masterData.trips[i].id === trip.id) {
              exists = true;
              if ((trip.u || 0) > (masterData.trips[i].u || 0)) {
                trip.su = now;
                masterData.trips[i] = trip;
              }
              break;
            }
          }
          if (!exists) {
            trip.su = now;
            masterData.trips.push(trip);
          }
        });
      }

      // 5. Merge Customers & Transactions
      if (changes.customers && changes.customers.length > 0) {
        if (!masterData.customers) masterData.customers = [];
        changes.customers.forEach(function (cust) {
          if (masterData.tomb && masterData.tomb[cust.id] && masterData.tomb[cust.id] >= (cust.u || 0)) return;
          var exists = false;
          for (var i = 0; i < masterData.customers.length; i++) {
            if (masterData.customers[i].id === cust.id) {
              exists = true;
              var existing = masterData.customers[i];
              if ((cust.u || 0) > (existing.u || 0)) {
                // Merge transactions list
                var mergedTxs = existing.txs || [];
                (cust.txs || []).forEach(function (tx) {
                  var txExists = mergedTxs.some(function (t) { return t.id === tx.id; });
                  if (!txExists) mergedTxs.push(tx);
                });
                cust.txs = mergedTxs;
                cust.su = now;
                masterData.customers[i] = cust;
              }
              break;
            }
          }
          if (!exists) {
            cust.su = now;
            masterData.customers.push(cust);
          }
        });
      }

      // 6. Merge Loans & Repayments
      if (changes.loans && changes.loans.length > 0) {
        if (!masterData.loans) masterData.loans = [];
        changes.loans.forEach(function (loan) {
          if (masterData.tomb && masterData.tomb[loan.id] && masterData.tomb[loan.id] >= (loan.u || 0)) return;
          var exists = false;
          for (var i = 0; i < masterData.loans.length; i++) {
            if (masterData.loans[i].id === loan.id) {
              exists = true;
              var existing = masterData.loans[i];
              if ((loan.u || 0) > (existing.u || 0)) {
                var mergedReps = existing.repayments || [];
                (loan.repayments || []).forEach(function (rep) {
                  var repExists = mergedReps.some(function (r) { return r.id === rep.id; });
                  if (!repExists) mergedReps.push(rep);
                });
                loan.repayments = mergedReps;
                loan.su = now;
                masterData.loans[i] = loan;
              }
              break;
            }
          }
          if (!exists) {
            loan.su = now;
            masterData.loans.push(loan);
          }
        });
      }

      // 7. Merge Expenses
      if (changes.expenses && changes.expenses.length > 0) {
        if (!masterData.expenses) masterData.expenses = [];
        changes.expenses.forEach(function (exp) {
          if (masterData.tomb && masterData.tomb[exp.id] && masterData.tomb[exp.id] >= (exp.u || 0)) return;
          var exists = false;
          for (var i = 0; i < masterData.expenses.length; i++) {
            if (masterData.expenses[i].id === exp.id) {
              exists = true;
              if ((exp.u || 0) > (masterData.expenses[i].u || 0)) {
                exp.su = now;
                masterData.expenses[i] = exp;
              }
              break;
            }
          }
          if (!exists) {
            exp.su = now;
            masterData.expenses.push(exp);
          }
        });
      }

      // 8. Merge Services
      if (changes.services && changes.services.length > 0) {
        if (!masterData.services) masterData.services = [];
        changes.services.forEach(function (srv) {
          if (masterData.tomb && masterData.tomb[srv.id] && masterData.tomb[srv.id] >= (srv.u || 0)) return;
          var exists = false;
          for (var i = 0; i < masterData.services.length; i++) {
            if (masterData.services[i].id === srv.id) {
              exists = true;
              if ((srv.u || 0) > (masterData.services[i].u || 0)) {
                srv.su = now;
                masterData.services[i] = srv;
              }
              break;
            }
          }
          if (!exists) {
            srv.su = now;
            masterData.services.push(srv);
          }
        });
      }

      // 9. Merge Suppliers
      if (changes.suppliers && changes.suppliers.length > 0) {
        if (!masterData.suppliers) masterData.suppliers = [];
        changes.suppliers.forEach(function (sup) {
          if (masterData.tomb && masterData.tomb[sup.id] && masterData.tomb[sup.id] >= (sup.u || 0)) return;
          var exists = false;
          for (var i = 0; i < masterData.suppliers.length; i++) {
            if (masterData.suppliers[i].id === sup.id) {
              exists = true;
              if ((sup.u || 0) > (masterData.suppliers[i].u || 0)) {
                sup.su = now;
                masterData.suppliers[i] = sup;
              }
              break;
            }
          }
          if (!exists) {
            sup.su = now;
            masterData.suppliers.push(sup);
          }
        });
      }

      // Save updated master file to Google Drive
      saveMasterData(masterFile, masterData);

      // Create daily snapshot backup if not already created today
      createDailyBackupIfNeeded(folder, masterData);

      // Compute Delta to return to client (records modified since 'since')
      var delta = {
        tomb: masterData.tomb || {},
        sales: (masterData.sales || []).filter(function (s) { return (s.u || 0) > since || (s.su || 0) > since; }),
        items: (masterData.items || []).filter(function (it) { return (it.u || 0) > since || (it.su || 0) > since; }),
        trips: (masterData.trips || []).filter(function (t) { return (t.u || 0) > since || (t.su || 0) > since; }),
        customers: (masterData.customers || []).filter(function (c) { return (c.u || 0) > since || (c.su || 0) > since; }),
        loans: (masterData.loans || []).filter(function (l) { return (l.u || 0) > since || (l.su || 0) > since; }),
        expenses: (masterData.expenses || []).filter(function (e) { return (e.u || 0) > since || (e.su || 0) > since; }),
        services: (masterData.services || []).filter(function (s) { return (s.u || 0) > since || (s.su || 0) > since; }),
        suppliers: (masterData.suppliers || []).filter(function (s) { return (s.u || 0) > since || (s.su || 0) > since; })
      };

      return respond({
        status: "ok",
        serverTime: now,
        delta: delta
      });
    }

    return respond({ status: "error", message: "অজানা অ্যাকশন: " + action });

  } catch (ex) {
    return respond({ status: "error", message: "সার্ভার ত্রুটি: " + ex.toString() });
  } finally {
    lock.releaseLock();
  }
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateFolder(folderName) {
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}

function getOrCreateMasterFile(folder) {
  var files = folder.getFilesByName(MASTER_FILE_NAME);
  if (files.hasNext()) {
    return files.next();
  }
  var initialData = {
    version: 1,
    items: [],
    sales: [],
    trips: [],
    customers: [],
    loans: [],
    expenses: [],
    services: [],
    suppliers: [],
    shopList: [],
    tomb: {}
  };
  return folder.createFile(MASTER_FILE_NAME, JSON.stringify(initialData), MimeType.PLAIN_TEXT);
}

function loadMasterData(file) {
  try {
    var content = file.getBlob().getDataAsString();
    if (content && content.trim() !== "") {
      return JSON.parse(content);
    }
  } catch (e) {}
  return { items: [], sales: [], trips: [], customers: [], loans: [], expenses: [], services: [], suppliers: [], tomb: {} };
}

function saveMasterData(file, data) {
  file.setContent(JSON.stringify(data));
}

function createDailyBackupIfNeeded(folder, masterData) {
  var todayStr = Utilities.formatDate(new Date(), "Asia/Dhaka", "yyyy-MM-dd");
  var backupFileName = "dokan-backup-" + todayStr + ".json";

  var existing = folder.getFilesByName(backupFileName);
  if (!existing.hasNext()) {
    // Create new daily backup
    folder.createFile(backupFileName, JSON.stringify(masterData, null, 2), MimeType.PLAIN_TEXT);

    // Prune backups older than 30 days
    pruneOldBackups(folder, 30);
  }
}

function pruneOldBackups(folder, maxCount) {
  var files = folder.getFiles();
  var backupFiles = [];
  while (files.hasNext()) {
    var f = files.next();
    if (f.getName().indexOf("dokan-backup-") === 0) {
      backupFiles.push(f);
    }
  }
  if (backupFiles.length > maxCount) {
    backupFiles.sort(function (a, b) {
      return a.getDateCreated().getTime() - b.getDateCreated().getTime();
    });
    for (var i = 0; i < backupFiles.length - maxCount; i++) {
      backupFiles[i].setTrashed(true);
    }
  }
}
