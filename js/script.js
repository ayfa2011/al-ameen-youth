// ============================================================
// AL-AMEEN YOUTH FEDERATION
// MAIN SCRIPT
// ============================================================


// ============================================================
// GOOGLE APPS SCRIPT URL
// ============================================================

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzPxZ0zX0ZjsHepbOM4AYYzvq3hx3ckqz7LAh-hsnalaRvbNr2YbwD47cS8kjDZWk40/exec";


// ============================================================
// FRONT-END PIN
// ============================================================

const CORRECT_PIN = "ayfa";


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

  document.getElementById("appContainer")?.setAttribute("data-active-view", "other");
  document.getElementById("dashboardHomeActions")?.classList.add("hidden");

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

  document.getElementById("appContainer")?.setAttribute("data-active-view", "dashboard");
  document.getElementById("dashboardHomeActions")?.classList.remove("hidden");

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

function openActivityReports(openForm = false) {

  hideAllViews();

  const activityView =
    document.getElementById("activityReportsView");

  if (activityView) {

    activityView.classList.remove("hidden");

  }

  if (typeof loadProgramReports === "function") {
    loadProgramReports().then(() => {
      if (openForm && typeof openProgramReportForm === "function") openProgramReportForm();
    });
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
// ============================================================
// BLOOD DONATION POSTER GENERATOR
// ============================================================

function openPosterGenerator() {

  hideAllViews();

  const view = document.getElementById("posterGeneratorView");

  if (view) {
    view.classList.remove("hidden");
  }

  // Set today's date automatically
  const dateInput = document.getElementById("posterDate");

  if (dateInput && !dateInput.value) {

    const today = new Date();

    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");

    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }
}


// ============================================================
// GENERATE POSTER
// ============================================================

function generateBloodPoster() {

  const donorName =
    document.getElementById("posterDonorName").value.trim();

  const bloodGroup =
    document.getElementById("posterBloodGroup").value.trim();

  const donationPlace =
    document.getElementById("posterDonationPlace").value.trim();

  const patientName =
    document.getElementById("posterPatientName").value.trim();

  const date =
    document.getElementById("posterDate").value;

  const photoInput =
    document.getElementById("posterDonorPhoto");


  if (!donorName) {
    alert("ದಯವಿಟ್ಟು ರಕ್ತದಾನಿಯ ಹೆಸರನ್ನು ನಮೂದಿಸಿ.");
    return;
  }

  if (!bloodGroup) {
    alert("ದಯವಿಟ್ಟು ರಕ್ತದ ಗುಂಪನ್ನು ನಮೂದಿಸಿ.");
    return;
  }

  if (!donationPlace) {
    alert("ದಯವಿಟ್ಟು ರಕ್ತ ನೀಡಿದ ಸ್ಥಳವನ್ನು ನಮೂದಿಸಿ.");
    return;
  }

  if (!patientName) {
    alert("ದಯವಿಟ್ಟು ರೋಗಿಯ ಹೆಸರನ್ನು ನಮೂದಿಸಿ.");
    return;
  }


  let formattedDate = "";

  if (date) {

    const parts = date.split("-");

    formattedDate =
      `${parts[2]}-${parts[1]}-${parts[0]}`;
  }


  const preview =
    document.getElementById("posterPreview");


  preview.innerHTML = `

    <div
      id="bloodPoster"
      class="blood-poster"
    >

      <!-- HEADER -->

      <div class="poster-header">

        <div class="poster-brand">

          <div class="poster-logo-circle">
            <i class="fa-solid fa-heart"></i>
          </div>

          <div>

            <div class="poster-brand-title">
              AL AMEEN
            </div>

            <div class="poster-brand-subtitle">
              Youth Federation
            </div>

          </div>

        </div>

        <div class="poster-anniversary">
          15
          <small>2011–2026</small>
        </div>

      </div>


      <!-- MAIN -->

      <div class="poster-main">


        <!-- PHOTO -->

        <div class="poster-photo-area">

          ${
            photoInput.files && photoInput.files[0]
            ?
            `<img id="posterDonorImage" alt="Donor Photo">`
            :
            `
            <div class="photo-placeholder">

              <i class="fa-solid fa-user"></i>

              <span>
                DONOR PHOTO
              </span>

            </div>
            `
          }

        </div>


        <!-- MESSAGE -->

        <div class="poster-message-area">

          <div class="blood-icon">
            <i class="fa-solid fa-droplet"></i>
          </div>

          <h1>
            ರಕ್ತದಾನ<br>
            <span>ಜೀವದಾನ</span>
          </h1>

          <div class="poster-line"></div>


          <p class="thank-you-text">

            <span>${escapeHTML(donationPlace)}</span>
            ಆಸ್ಪತ್ರೆಯಲ್ಲಿ ಚಿಕಿತ್ಸೆ ಪಡೆಯುತ್ತಿದ್ದ

            <span>${escapeHTML(patientName)}</span>
            ಎಂಬ ರೋಗಿಗೆ

            <span>${escapeHTML(bloodGroup)}</span>
            ರಕ್ತದ ಅಗತ್ಯವಿದ್ದ ಸಂದರ್ಭದಲ್ಲಿ,

            ಮಾನವೀಯತೆಯಿಂದ ರಕ್ತದಾನ ಮಾಡಿದ

            <span>${escapeHTML(donorName)}</span>
            ರವರಿಗೆ

            <strong>
              ಹೃದಯಪೂರ್ವಕ ಧನ್ಯವಾದಗಳು ಮತ್ತು ಕೃತಜ್ಞತೆಗಳು!
            </strong>

          </p>

        </div>

      </div>


      <!-- INFORMATION -->

      <div class="poster-information">


        <div class="poster-info-box">

          <i class="fa-solid fa-user"></i>

          <div>

            <small>
              ರಕ್ತದಾನಿಯ ಹೆಸರು
            </small>

            <strong>
              ${escapeHTML(donorName)}
            </strong>

          </div>

        </div>


        <div class="poster-info-box">

          <i class="fa-solid fa-droplet"></i>

          <div>

            <small>
              ರಕ್ತದ ಗುಂಪು
            </small>

            <strong>
              ${escapeHTML(bloodGroup)}
            </strong>

          </div>

        </div>


        <div class="poster-info-box">

          <i class="fa-solid fa-location-dot"></i>

          <div>

            <small>
              ರಕ್ತ ನೀಡಿದ ಸ್ಥಳ
            </small>

            <strong>
              ${escapeHTML(donationPlace)}
            </strong>

          </div>

        </div>


        <div class="poster-info-box">

          <i class="fa-solid fa-bed"></i>

          <div>

            <small>
              ರೋಗಿಯ ಹೆಸರು
            </small>

            <strong>
              ${escapeHTML(patientName)}
            </strong>

          </div>

        </div>


        <div class="poster-info-box">

          <i class="fa-solid fa-calendar"></i>

          <div>

            <small>
              ದಿನಾಂಕ
            </small>

            <strong>
              ${escapeHTML(formattedDate || "-")}
            </strong>

          </div>

        </div>


      </div>


      <!-- FOOTER -->

      <div class="poster-footer">

        <div class="footer-heart">
          <i class="fa-solid fa-heart"></i>
        </div>

        <div>

          <strong>
            ಅಲ್ ಅಮೀನ್ ಯೂತ್ ಫೆಡರೇಶನ್
          </strong>

          <span>
            ಅರಂಬೂರು, ಸುಳ್ಯ, ದ.ಕ.
          </span>

        </div>

      </div>

    </div>


    <button
      type="button"
      class="download-poster-btn"
      onclick="downloadBloodPoster()"
    >

      <i class="fa-solid fa-download"></i>

      Download Poster

    </button>

  `;


  // Add uploaded photo

  if (photoInput.files && photoInput.files[0]) {

    const reader = new FileReader();

    reader.onload = function(event) {

      const image =
        document.getElementById("posterDonorImage");

      if (image) {
        image.src = event.target.result;
      }

    };

    reader.readAsDataURL(photoInput.files[0]);
  }

}


// ============================================================
// DOWNLOAD POSTER
// ============================================================

async function downloadBloodPoster() {

  const poster =
    document.getElementById("bloodPoster");

  if (!poster) {
    alert("ಮೊದಲು Poster Generate ಮಾಡಿ.");
    return;
  }


  if (typeof html2canvas === "undefined") {

    alert(
      "Poster download library load ಆಗಿಲ್ಲ. Internet connection ಪರಿಶೀಲಿಸಿ."
    );

    return;
  }


  const canvas =
    await html2canvas(poster, {

      scale: 2,

      useCORS: true,

      backgroundColor: "#ffffff"

    });


  const link =
    document.createElement("a");


  const donorName =
    document
      .getElementById("posterDonorName")
      .value
      .trim()
      .replace(/\s+/g, "_");


  link.download =
    `Blood_Donation_${donorName || "Poster"}.png`;


  link.href =
    canvas.toDataURL("image/png");


  link.click();

}
