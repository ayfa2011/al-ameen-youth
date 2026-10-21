// Poster preview and download UI behavior. No database writes.
// ========================================================
    // GENERATE POSTER
    // ========================================================

    function generateBloodDonationPoster() {


      const donorName =
        document
          .getElementById(
            "posterDonorName"
          )
          .value
          .trim();


      const bloodGroup =
        document
          .getElementById(
            "posterBloodGroup"
          )
          .value
          .trim();


      const donationPlace =
        document
          .getElementById(
            "posterDonationPlace"
          )
          .value
          .trim();


      const patientName =
        document
          .getElementById(
            "posterPatientName"
          )
          .value
          .trim();


      const date =
        document
          .getElementById(
            "posterDate"
          )
          .value;


      const photoInput =
        document.getElementById(
          "posterDonorPhoto"
        );


      // ======================================================
      // VALIDATION
      // ======================================================

      if (!donorName) {

        alert(
          "ದಯವಿಟ್ಟು ರಕ್ತದಾನಿಯ ಹೆಸರನ್ನು ನಮೂದಿಸಿ."
        );

        return;

      }


      if (!bloodGroup) {

        alert(
          "ದಯವಿಟ್ಟು ರಕ್ತದ ಗುಂಪನ್ನು ನಮೂದಿಸಿ."
        );

        return;

      }


      if (!donationPlace) {

        alert(
          "ದಯವಿಟ್ಟು ರಕ್ತ ನೀಡಿದ ಸ್ಥಳವನ್ನು ನಮೂದಿಸಿ."
        );

        return;

      }


      if (!patientName) {

        alert(
          "ದಯವಿಟ್ಟು ರೋಗಿಯ ಹೆಸರನ್ನು ನಮೂದಿಸಿ."
        );

        return;

      }


      if (!date) {

        alert(
          "ದಯವಿಟ್ಟು ದಿನಾಂಕವನ್ನು ಆಯ್ಕೆ ಮಾಡಿ."
        );

        return;

      }


      if (
        !photoInput.files ||
        !photoInput.files[0]
      ) {

        alert(
          "ದಯವಿಟ್ಟು ರಕ್ತದಾನಿಯ ಫೋಟೋ upload ಮಾಡಿ."
        );

        return;

      }



      // ======================================================
      // PUT TEXT ON ORIGINAL DESIGN
      // ======================================================

      document.getElementById(
        "posterValueDonor"
      ).textContent =
        donorName;


      document.getElementById(
        "posterValueBlood"
      ).textContent =
        bloodGroup;


      document.getElementById(
        "posterValuePlace"
      ).textContent =
        donationPlace;


      document.getElementById(
        "posterValuePatient"
      ).textContent =
        patientName;


      document.getElementById(
        "posterValueDate"
      ).textContent =
        formatPosterDate(date);



      // ======================================================
      // PHOTO
      // ======================================================

      const file =
        photoInput.files[0];


      const reader =
        new FileReader();


      reader.onload =
        function(event) {


          const donorPhoto =
            document.getElementById(
              "bloodPosterDonorPhoto"
            );


          donorPhoto.src =
            event.target.result;


          donorPhoto.style.display =
            "block";


          // Scroll to preview

          document
            .getElementById(
              "bloodPosterCanvas"
            )
            .scrollIntoView({

              behavior: "smooth",

              block: "center"

            });

        };


      reader.readAsDataURL(file);

    }



    // ========================================================
    // CLEAR FORM
    // ========================================================

    function clearPosterForm() {


      document.getElementById(
        "posterDonorName"
      ).value = "";


      document.getElementById(
        "posterBloodGroup"
      ).value = "";


      document.getElementById(
        "posterDonationPlace"
      ).value = "";


      document.getElementById(
        "posterPatientName"
      ).value = "";


      document.getElementById(
        "posterDate"
      ).value = "";


      document.getElementById(
        "posterDonorPhoto"
      ).value = "";


      document.getElementById(
        "posterValueDonor"
      ).textContent = "";


      document.getElementById(
        "posterValueBlood"
      ).textContent = "";


      document.getElementById(
        "posterValuePlace"
      ).textContent = "";


      document.getElementById(
        "posterValuePatient"
      ).textContent = "";


      document.getElementById(
        "posterValueDate"
      ).textContent = "";


      const donorPhoto =
        document.getElementById(
          "bloodPosterDonorPhoto"
        );


      donorPhoto.src = "";

      donorPhoto.style.display =
        "none";

    }



    // ========================================================
    // DOWNLOAD POSTER
    // ========================================================

    async function downloadBloodDonationPoster() {


      const canvas =
        document.getElementById(
          "bloodPosterCanvas"
        );


      if (!canvas) {

        alert(
          "Poster canvas ಸಿಗಲಿಲ್ಲ."
        );

        return;

      }


      const donorName =
        document
          .getElementById(
            "posterDonorName"
          )
          .value
          .trim();


      if (!donorName) {

        alert(
          "ಮೊದಲು Poster Generate ಮಾಡಿ."
        );

        return;

      }


      // Make sure html2canvas exists

      if (
        typeof html2canvas ===
        "undefined"
      ) {

        alert(
          "Poster download library load ಆಗಿಲ್ಲ."
        );

        return;

      }


      const button =
        document.getElementById(
          "downloadPosterButton"
        );


      const oldText =
        button.innerHTML;


      button.innerHTML =

        '<i class="fa-solid fa-spinner fa-spin"></i> Preparing...';


      button.disabled = true;


      try {


        // ====================================================
        // CREATE HIGH QUALITY IMAGE
        // ====================================================

        const renderedCanvas =
          await html2canvas(
            canvas,
            {

              scale: 3,

              useCORS: true,

              allowTaint: false,

              backgroundColor:
                "#ffffff",

              imageTimeout: 15000,

              logging: false

            }
          );


        // ====================================================
        // DOWNLOAD
        // ====================================================

        const link =
          document.createElement(
            "a"
          );


        const safeName =
          donorName
            .replace(
              /[^a-zA-Z0-9\u0C80-\u0CFF\s_-]/g,
              ""
            )
            .trim()
            .replace(
              /\s+/g,
              "_"
            );


        link.download =
          "Blood_Donation_" +
          (safeName || "Poster") +
          ".png";


        link.href =
          renderedCanvas.toDataURL(
            "image/png"
          );


        document.body.appendChild(
          link
        );


        link.click();


        document.body.removeChild(
          link
        );


      }

      catch(error) {

        console.error(
          "Poster download error:",
          error
        );


        alert(
          "Poster download ಮಾಡುವಾಗ ಸಮಸ್ಯೆ ಉಂಟಾಗಿದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ."
        );

      }


      finally {

        button.innerHTML =
          oldText;

        button.disabled = false;

      }

    }



    // ========================================================
    // PREVIEW PHOTO IMMEDIATELY AFTER SELECTING
    // ========================================================

    document
      .getElementById(
        "posterDonorPhoto"
      )
      .addEventListener(
        "change",
        function() {


          const file =
            this.files &&
            this.files[0];


          if (!file) {

            return;

          }


          if (
            !file.type.startsWith(
              "image/"
            )
          ) {

            alert(
              "ದಯವಿಟ್ಟು image file ಮಾತ್ರ ಆಯ್ಕೆ ಮಾಡಿ."
            );

            this.value = "";

            return;

          }


          const reader =
            new FileReader();


          reader.onload =
            function(event) {


              const image =
                document.getElementById(
                  "bloodPosterDonorPhoto"
                );


              image.src =
                event.target.result;


              image.style.display =
                "block";

            };


          reader.readAsDataURL(file);

        }
      );
