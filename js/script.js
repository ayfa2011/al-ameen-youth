// ============================================================
// AL-AMEEN YOUTH FEDERATION
// MAIN SCRIPT
// ============================================================


// ============================================================
// GOOGLE APPS SCRIPT URL
// ============================================================

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwMDWqPHpyTcPFdr8v2vxumkVQniQCf_Rmrn_Zqajz0z5scwh08RPRVGJ3m89kyh3_c/exec";


// ============================================================
// FRONT-END PIN
// ============================================================

const CORRECT_PIN = "1234";


// ============================================================
// OFFICE BEARERS - 2027
// ============================================================

const bearers2027Data = [

  {
    sl: 1,
    designation: "Honorary President",
    name: "Kabeer Limra"
  },

  {
    sl: 2,
    designation: "President",
    name: "Abdulla Kunji (Abdulla Aramboor)"
  },

  {
    sl: 3,
    designation: "Vice President",
    name: "Safwan Mambli"
  },

  {
    sl: 4,
    designation: "Vice President",
    name: "Miraj Mambli"
  },

  {
    sl: 5,
    designation: "General Secretary",
    name: "Asif Panne"
  },

  {
    sl: 6,
    designation: "Treasurer",
    name: "Nasir Paladka"
  },

  {
    sl: 7,
    designation: "Joint Secretary",
    name: "Nizar Paladka"
  },

  {
    sl: 8,
    designation: "Joint Secretary",
    name: "Ashik Star"
  },

  {
    sl: 9,
    designation: "Joint Treasurer",
    name: "Ashphak P.R."
  },

  {
    sl: 10,
    designation: "Joint Treasurer",
    name: "Mahammad Mambli"
  },

  {
    sl: 11,
    designation: "Honorary Advisor",
    name: "Shamsudheen Mambli"
  },

  {
    sl: 12,
    designation: "Media",
    name: "Adnan"
  },

  {
    sl: 13,
    designation: "Media",
    name: "Fazan"
  },

  {
    sl: 14,
    designation: "Academic",
    name: "Rauf Mambli"
  },

  {
    sl: 15,
    designation: "Medical Wing",
    name: "Rameez Shine"
  },

  {
    sl: 16,
    designation: "Asset Management",
    name: "Javed Shaik"
  }

];


// ============================================================
// SECURITY / HTML HELPERS
// ============================================================

function escapeHTML(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


// ============================================================
// API CHECK
// ============================================================

function hasApiUrl() {

  return (
    SCRIPT_URL &&
    !SCRIPT_URL.includes("PASTE_YOUR")
  );

}


// ============================================================
// HIDE ALL APPLICATION VIEWS
// ============================================================

function hideAllViews() {

  const views = [

    "dashboardView",
    "activityReportsView",
    "yearSelectView",
    "bearersTableView",
    "attendanceView",
    "membersView",
    "bloodDonorsView"

  ];


  views.forEach(id => {

    const element =
      document.getElementById(id);

    if (element) {

      element.classList.add("hidden");

    }

  });

}


// ============================================================
// SHOW DASHBOARD
// ============================================================

function showDashboard() {

  hideAllViews();

  const dashboard =
    document.getElementById("dashboardView");

  if (dashboard) {

    dashboard.classList.remove("hidden");

  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


// ============================================================
// ACTIVITY REPORTS
// ============================================================

function openActivityReports() {

  hideAllViews();

  const activityView =
    document.getElementById("activityReportsView");

  if (activityView) {

    activityView.classList.remove("hidden");

  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


// ============================================================
// OFFICE BEARERS
// ============================================================

function openOfficeBearers() {

  hideAllViews();

  const view =
    document.getElementById("yearSelectView");

  if (view) {

    view.classList.remove("hidden");

  }

}


// ============================================================
// MEMBERS PROFILE
// ============================================================

function openMembersProfile() {

  hideAllViews();

  const view =
    document.getElementById("membersView");

  if (view) {

    view.classList.remove("hidden");

  }


  if (
    typeof renderMemberCards === "function"
  ) {

    renderMemberCards();

  }

}


// ============================================================
// BLOOD DONORS
// ============================================================

function openBloodDonors() {

  hideAllViews();

  const view =
    document.getElementById("bloodDonorsView");

  if (view) {

    view.classList.remove("hidden");

  }


  if (
    typeof renderBloodDonors === "function"
  ) {

    renderBloodDonors();

  }

}


// ============================================================
// ATTENDANCE
// ============================================================

function openAttendance() {

  hideAllViews();

  const view =
    document.getElementById("attendanceView");

  if (view) {

    view.classList.remove("hidden");

  }


  if (
    typeof loadAttendanceSheet === "function"
  ) {

    loadAttendanceSheet();

  }

}


// ============================================================
// PIN LOGIN
// ============================================================

function checkPin() {

  const input =
    document.getElementById("pinInput");

  const error =
    document.getElementById("pinError");


  if (!input) {

    return;

  }


  if (
    input.value.trim() === CORRECT_PIN
  ) {

    const pinScreen =
      document.getElementById("pinScreen");

    const appContainer =
      document.getElementById("appContainer");


    if (pinScreen) {

      pinScreen.classList.add("hidden");

    }


    if (appContainer) {

      appContainer.classList.remove("hidden");

    }


    if (error) {

      error.textContent = "";

    }


    showDashboard();

  }

  else {

    if (error) {

      error.textContent =
        "ತಪ್ಪಾದ PIN! ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.";

    }

    input.select();

  }

}


// ============================================================
// OFFICE BEARERS TABLE
// ============================================================

function loadBearers(year) {

  hideAllViews();


  const tableView =
    document.getElementById("bearersTableView");

  if (tableView) {

    tableView.classList.remove("hidden");

  }


  const title =
    document.getElementById("selectedYearTitle");

  const tbody =
    document.getElementById("bearersTableBody");


  if (!tbody) {

    return;

  }


  if (title) {

    title.textContent = year;

  }


  tbody.innerHTML = "";


  if (year !== "2027") {

    tbody.innerHTML = `

      <tr>

        <td
          colspan="3"
          class="empty-cell"
        >

          ${escapeHTML(year)}
          ರ Office Bearers data
          ಇನ್ನೂ ಸೇರಿಸಲಾಗಿಲ್ಲ.

        </td>

      </tr>

    `;

    return;

  }


  bearers2027Data.forEach(item => {

    tbody.insertAdjacentHTML(

      "beforeend",

      `

      <tr>

        <td>
          ${item.sl}
        </td>

        <td>
          ${escapeHTML(item.designation)}
        </td>

        <td>
          ${escapeHTML(item.name)}
        </td>

      </tr>

      `

    );

  });

}


// ============================================================
// PDF PRINT
// ============================================================

function downloadPDF() {

  window.print();

}


// ============================================================
// COMING SOON
// ============================================================

function showComingSoon(title) {

  alert(

    `${title}\n\n` +
    `ಈ ವಿಭಾಗಕ್ಕೆ ಇನ್ನೂ Google Sheet / backend data connect ಮಾಡಲಾಗಿಲ್ಲ.`

  );

}


// ============================================================
// LOGIN MODAL PLACEHOLDER
// ============================================================

function openLoginModal(type) {

  alert(

    `${
      type === "member"
        ? "Member"
        : "Official"
    } Login\n\n` +
    `Login module ಇನ್ನೂ setup ಮಾಡಲಾಗಿಲ್ಲ.`

  );

}


// ============================================================
// OLD PDF REPORT FUNCTION
// ============================================================

function openPdfReport(year) {

  alert(

    `${year} Activity Report PDF ಇನ್ನೂ upload/link ಮಾಡಲಾಗಿಲ್ಲ.`

  );

}


// ============================================================
// CLOSE PDF VIEWER
// ============================================================

function closePdfReport() {

  const box =
    document.getElementById(
      "pdfViewerContainer"
    );

  const iframe =
    document.getElementById(
      "pdfIframe"
    );


  if (box) {

    box.style.display = "none";

  }


  if (iframe) {

    iframe.src = "";

  }

}


// ============================================================
// FINANCE PLACEHOLDER
// ============================================================

function showFinanceYear(year) {

  alert(

    `${year} Finance data ಇನ್ನೂ Google Sheetಗೆ connect ಮಾಡಲಾಗಿಲ್ಲ.`

  );

}


// ============================================================
// FINANCE PDF PLACEHOLDER
// ============================================================

function downloadFinancePDF() {

  alert(
    "Finance PDF ಇನ್ನೂ setup ಮಾಡಲಾಗಿಲ್ಲ."
  );

}


// ============================================================
// OLD BLOOD GROUP SEARCH
// ============================================================

function searchBloodDonors() {

  const select =
    document.getElementById(
      "bloodGroupSelect"
    );

  const results =
    document.getElementById(
      "donorResults"
    );


  if (!select || !results) {

    return;

  }


  const group =
    select.value;


  if (!group) {

    results.innerHTML =
      "<p>ದಯವಿಟ್ಟು Blood Group ಆಯ್ಕೆ ಮಾಡಿ.</p>";

    return;

  }


  const donors =
    (window.fullMembersList || [])
      .filter(member =>

        String(
          member.bloodGroup || ""
        )
        .toUpperCase() ===
        group.toUpperCase()

      );


  results.innerHTML = donors.length

    ?

    donors
      .map(member => `

        <div class="member-card">

          <div class="member-info">

            <h3>
              ${escapeHTML(member.name)}
            </h3>

            <p>
              Blood:
              <strong>
                ${escapeHTML(member.bloodGroup)}
              </strong>
            </p>

            <p>
              Donated:
              ${escapeHTML(
                member.bloodCount || 0
              )}
              times
            </p>

          </div>

          <div class="card-actions">

            <a
              class="btn-call"
              href="tel:${escapeHTML(member.mobile)}"
            >
              Call
            </a>

          </div>

        </div>

      `)
      .join("")

    :

    `<p>
      No ${escapeHTML(group)}
      blood donors found.
    </p>`;

}


// ============================================================
// DOM READY
// ============================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    const pinInput =
      document.getElementById(
        "pinInput"
      );


    if (pinInput) {

      pinInput.addEventListener(
        "keyup",
        event => {

          if (
            event.key === "Enter"
          ) {

            checkPin();

          }

        }
      );

    }

  }
);