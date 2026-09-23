// Al-Ameen quiz-only Google Apps Script Web App. Bind a copy to the authorized quiz spreadsheet.
function doGet(e) {
  try {
    const action=(e&&e.parameter&&e.parameter.action)||"";
    return quizJsonOutput_(quizApiGet_(action,e.parameter||{}));
  } catch(error) { return quizJsonOutput_({success:false,error:error.message||String(error)}); }
}
function doPost(e) {
  try {
    const body=JSON.parse((e&&e.postData&&e.postData.contents)||"{}");
    return quizJsonOutput_(quizApiPost_(body));
  } catch(error) { return quizJsonOutput_({success:false,error:error.message||String(error)}); }
}
function quizJsonOutput_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }

//
// Run initializeQuizSheets() once from the bound Apps Script.
// Configure SMS properties before enabling password reset OTP.
// ============================================================

const QUIZ_SHEET_HEADERS_ = {
  QuizMembers: ["MemberID", "Mobile", "Name", "PasswordSalt", "PasswordHash", "SessionHash", "CreatedAt", "Status"],
  QuizQuestions: ["QuizID", "QuestionNo", "Type", "Question", "OptionsJSON", "CorrectAnswerJSON", "Seconds", "Points", "MediaURL", "Active"],
  QuizAttempts: ["AttemptID", "QuizID", "MemberID", "Mobile", "Name", "StartedAt", "SubmittedAt", "Status", "AutoScore", "FinalScore", "TimeSeconds"],
  QuizAnswers: ["AttemptID", "QuizID", "MemberID", "QuestionNo", "AnswerJSON", "AutoCorrect", "AdminPoints", "AdminNote"]
};

function quizSpreadsheet_() {
  const id=PropertiesService.getScriptProperties().getProperty("QUIZ_SPREADSHEET_ID");
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function initializeQuizSheets() {
  const book=quizSpreadsheet_();
  Object.keys(QUIZ_SHEET_HEADERS_).forEach(name => {
    let sheet = book.getSheetByName(name);
    if (!sheet) sheet = book.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, QUIZ_SHEET_HEADERS_[name].length).setValues([QUIZ_SHEET_HEADERS_[name]]);
      sheet.setFrozenRows(1);
    }
  });
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("QUIZ_ADMIN_SALT")) {
    const salt = Utilities.getUuid();
    props.setProperties({
      QUIZ_ADMIN_SALT: salt,
      QUIZ_ADMIN_HASH: quizHash_("ayfa", salt),
      QUIZ_ADMIN_MUST_CHANGE: "true"
    });
  }
  return "Quiz sheets are ready. Temporary admin password: ayfa (change it after first login).";
}

function quizSheet_(name) {
  const book=quizSpreadsheet_();
  const sheet = book.getSheetByName(name);
  if (!sheet) throw new Error("Quiz setup required: run initializeQuizSheets() first.");
  return sheet;
}
function quizHash_(value, salt) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + "|" + value, Utilities.Charset.UTF_8));
}
function quizNewToken_() { return Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid(); }
function quizJson_(value, fallback) { try { return JSON.parse(value); } catch (_) { return fallback; } }
function quizRows_(name) {
  const s = quizSheet_(name), values = s.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).map((row, i) => {
    const o = { _row: i + 2 };
    headers.forEach((h, j) => o[h] = row[j]);
    return o;
  }).filter(o => o[headers[0]] !== "" && o[headers[0]] != null);
}
function quizMemberByMobile_(mobile) { return quizRows_("QuizMembers").find(x => String(x.Mobile) === String(mobile)); }
function quizRequireMember_(token) {
  if (!token) throw new Error("Please log in again.");
  const hash = quizHash_(token, "session-v1");
  const member = quizRows_("QuizMembers").find(x => x.SessionHash === hash && x.Status !== "disabled");
  if (!member) throw new Error("Session expired. Please log in again.");
  return member;
}
function quizRequireAdmin_(token) {
  if (!token || CacheService.getScriptCache().get("quiz_admin_" + quizHash_(token, "admin-v1")) !== "ok") throw new Error("Admin login required.");
}

function quizApiGet_(action, params) {
  if (action === "quizQuestions") {
    const quizId = String(params.quizId || "current");
    return { success: true, questions: quizRows_("QuizQuestions").filter(q => String(q.QuizID) === quizId && String(q.Active).toLowerCase() !== "false").sort((a,b) => Number(a.QuestionNo)-Number(b.QuestionNo)).map(q => ({quizId:String(q.QuizID), number:Number(q.QuestionNo), type:String(q.Type), question:String(q.Question), options:quizJson_(q.OptionsJSON, []), seconds:Number(q.Seconds)||30, points:Number(q.Points)||1, mediaURL:String(q.MediaURL||"")})) };
  }
  throw new Error("Unknown quiz action.");
}

function quizApiPost_(body) {
  switch (body.action) {
    case "quizSignup": return quizSignup_(body);
    case "quizLogin": return quizLogin_(body);
    case "quizChangePassword": return quizChangePassword_(body);
    case "quizResetRequest": return quizResetRequest_(body);
    case "quizResetConfirm": return quizResetConfirm_(body);
    case "quizSubmit": return quizSubmit_(body);
    case "quizAdminLogin": return quizAdminLogin_(body);
    case "quizAdminChangePassword": return quizAdminChangePassword_(body);
    case "quizAdminListAttempts": return quizAdminListAttempts_(body);
    case "quizMyResults": return quizMyResults_(body);
    case "quizAdminGrade": return quizAdminGrade_(body);
    case "quizAdminSaveQuestion": return quizAdminSaveQuestion_(body);
    case "quizAdminResetMemberPassword": return quizAdminResetMemberPassword_(body);
    default: throw new Error("Unknown quiz action.");
  }
}

function quizSignup_(b) {
  const mobile = String(b.mobile || "").replace(/\D/g, "");
  const name = String(b.name || "").trim().slice(0, 80), password = String(b.password || "");
  if (mobile.length < 8 || mobile.length > 15 || !name || password.length < 8) throw new Error("Enter a valid mobile, name, and password (at least 8 characters).");
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    if (quizMemberByMobile_(mobile)) throw new Error("This mobile number already has an account. Please log in.");
    const id = Utilities.getUuid(), salt = Utilities.getUuid(), token = quizNewToken_();
    quizSheet_("QuizMembers").appendRow([id, mobile, name, salt, quizHash_(password, salt), quizHash_(token, "session-v1"), new Date(), "active"]);
    return {success:true, token, member:{id, mobile, name}};
  } finally { lock.releaseLock(); }
}
function quizLogin_(b) {
  const mobile = String(b.mobile || "").replace(/\D/g, ""), member = quizMemberByMobile_(mobile);
  if (!member || member.Status === "disabled" || quizHash_(String(b.password || ""), String(member.PasswordSalt)) !== member.PasswordHash) throw new Error("Mobile number or password is incorrect.");
  const token = quizNewToken_();
  quizSheet_("QuizMembers").getRange(member._row, 6).setValue(quizHash_(token, "session-v1"));
  return {success:true, token, member:{id:String(member.MemberID),mobile:String(member.Mobile),name:String(member.Name)}};
}
function quizChangePassword_(b) {
  const member=quizRequireMember_(String(b.token||"")), current=String(b.currentPassword||""), password=String(b.password||"");
  if(password.length<8)throw new Error("Password must have at least 8 characters.");
  if(quizHash_(current,String(member.PasswordSalt))!==member.PasswordHash)throw new Error("Current password is incorrect.");
  const salt=Utilities.getUuid();quizSheet_("QuizMembers").getRange(member._row,4,1,2).setValues([[salt,quizHash_(password,salt)]]);return {success:true};
}

function quizResetRequest_(b) {
  const mobile = String(b.mobile || "").replace(/\D/g, ""), member = quizMemberByMobile_(mobile);
  if (!member) throw new Error("No account found for that mobile number.");
  const props = PropertiesService.getScriptProperties(), sid = props.getProperty("QUIZ_SMS_ACCOUNT_SID"), auth = props.getProperty("QUIZ_SMS_AUTH_TOKEN"), from = props.getProperty("QUIZ_SMS_FROM");
  if (!sid || !auth || !from) throw new Error("SMS reset is not configured yet. Please ask an admin to reset this password.");
  const code = String(Math.floor(100000 + Math.random() * 900000));
  CacheService.getScriptCache().put("quiz_otp_" + mobile, quizHash_(code, mobile), 300);
  const response = UrlFetchApp.fetch("https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Messages.json", {method:"post", payload:{To:"+"+mobile,From:from,Body:"Your Al-Ameen quiz password reset code is " + code + ". It expires in 5 minutes."}, headers:{Authorization:"Basic " + Utilities.base64Encode(sid+":"+auth)}, muteHttpExceptions:true});
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) { CacheService.getScriptCache().remove("quiz_otp_"+mobile); throw new Error("OTP could not be sent. Please try later."); }
  return {success:true, message:"OTP sent. It expires in 5 minutes."};
}
function quizResetConfirm_(b) {
  const mobile = String(b.mobile || "").replace(/\D/g, ""), code = String(b.code || ""), password = String(b.password || "");
  if (password.length < 8) throw new Error("Choose a password with at least 8 characters.");
  const cache = CacheService.getScriptCache(), saved = cache.get("quiz_otp_"+mobile);
  if (!saved || saved !== quizHash_(code, mobile)) throw new Error("OTP is incorrect or has expired.");
  const member=quizMemberByMobile_(mobile); if(!member) throw new Error("Account not found.");
  const salt=Utilities.getUuid(); quizSheet_("QuizMembers").getRange(member._row,4,1,2).setValues([[salt,quizHash_(password,salt)]]); cache.remove("quiz_otp_"+mobile);
  return {success:true};
}

function quizSubmit_(b) {
  const member = quizRequireMember_(String(b.token||"")), quizId=String(b.quizId||"current"), answers=Array.isArray(b.answers)?b.answers:[];
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const attempts=quizRows_("QuizAttempts");
    if(attempts.some(a=>String(a.QuizID)===quizId&&String(a.MemberID)===String(member.MemberID))) throw new Error("You have already submitted this quiz.");
    const questions=quizRows_("QuizQuestions").filter(q=>String(q.QuizID)===quizId&&String(q.Active).toLowerCase()!=="false");
    if(!questions.length||answers.length!==questions.length) throw new Error("Quiz questions are not ready or answers are incomplete.");
    const attemptId=Utilities.getUuid(), submitted=new Date(), started=new Date(Number(b.startedAt)||Date.now()), answerRows=[];let autoScore=0;
    questions.sort((a,b)=>Number(a.QuestionNo)-Number(b.QuestionNo)).forEach((q,i)=>{
      const response=answers[i], given=Array.isArray(response)?response:[String(response||"")], expected=quizJson_(q.CorrectAnswerJSON,[]).map(x=>String(x).trim().toLowerCase());
      const auto=String(q.Type)==="multiple" && expected.length===given.length && expected.every(x=>given.map(v=>String(v).trim().toLowerCase()).includes(x)); if(auto)autoScore+=Number(q.Points)||1;
      answerRows.push([attemptId,quizId,String(member.MemberID),Number(q.QuestionNo),JSON.stringify(given),auto?"YES":(String(q.Type)==="multiple"?"NO":"PENDING"),auto?(auto?(Number(q.Points)||1):0):"",""]);
    });
    quizSheet_("QuizAttempts").appendRow([attemptId,quizId,String(member.MemberID),String(member.Mobile),String(member.Name),started,submitted,"Pending",autoScore,"",Math.max(0,Math.round((submitted-started)/1000))]);
    if(answerRows.length)quizSheet_("QuizAnswers").getRange(quizSheet_("QuizAnswers").getLastRow()+1,1,answerRows.length,8).setValues(answerRows);
    return {success:true,status:"Pending admin review",autoScore,attemptId};
  } finally {lock.releaseLock();}
}

function quizMyResults_(b) {
  const member=quizRequireMember_(String(b.token||""));
  const attempts=quizRows_("QuizAttempts").filter(a=>String(a.MemberID)===String(member.MemberID)).reverse();
  return {success:true,results:attempts.map(a=>({quizId:String(a.QuizID),date:a.SubmittedAt?new Date(a.SubmittedAt).toISOString():"",status:String(a.Status),score:a.Status==="Reviewed"?Number(a.FinalScore)||0:null,totalQuestions:quizRows_("QuizQuestions").filter(q=>String(q.QuizID)===String(a.QuizID)).length}))};
}

function quizAdminLogin_(b) {
  const props=PropertiesService.getScriptProperties();if(!props.getProperty("QUIZ_ADMIN_HASH"))initializeQuizSheets();
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const cache=CacheService.getScriptCache(), failures=Number(cache.get("quiz_admin_failures")||0);
    if(failures>=8)throw new Error("Too many attempts. Try again in 15 minutes.");
    if(quizHash_(String(b.password||""),props.getProperty("QUIZ_ADMIN_SALT"))!==props.getProperty("QUIZ_ADMIN_HASH")){cache.put("quiz_admin_failures",String(failures+1),900);throw new Error("Admin password is incorrect.");}
    cache.remove("quiz_admin_failures");const token=quizNewToken_();cache.put("quiz_admin_"+quizHash_(token,"admin-v1"),"ok",21600);
    return {success:true,token,mustChangePassword:props.getProperty("QUIZ_ADMIN_MUST_CHANGE")==="true"};
  } finally {lock.releaseLock();}
}
function quizAdminChangePassword_(b) {
  quizRequireAdmin_(b.token);const password=String(b.password||"");if(password.length<10)throw new Error("Admin password must have at least 10 characters.");
  const salt=Utilities.getUuid();PropertiesService.getScriptProperties().setProperties({QUIZ_ADMIN_SALT:salt,QUIZ_ADMIN_HASH:quizHash_(password,salt),QUIZ_ADMIN_MUST_CHANGE:"false"});return {success:true};
}
function quizAdminListAttempts_(b) {
  quizRequireAdmin_(b.token);const attempts=quizRows_("QuizAttempts");const answers=quizRows_("QuizAnswers"), questions=quizRows_("QuizQuestions");
  return {success:true,attempts:attempts.map(a=>({attemptId:String(a.AttemptID),quizId:String(a.QuizID),memberId:String(a.MemberID),name:String(a.Name),mobile:String(a.Mobile),status:String(a.Status),autoScore:Number(a.AutoScore)||0,finalScore:a.FinalScore===""?null:Number(a.FinalScore),timeSeconds:Number(a.TimeSeconds)||0,answers:answers.filter(x=>String(x.AttemptID)===String(a.AttemptID)).map(x=>({questionNo:Number(x.QuestionNo),question:String((questions.find(q=>String(q.QuizID)===String(a.QuizID)&&Number(q.QuestionNo)===Number(x.QuestionNo))||{}).Question||""),type:String((questions.find(q=>String(q.QuizID)===String(a.QuizID)&&Number(q.QuestionNo)===Number(x.QuestionNo))||{}).Type||""),answer:quizJson_(x.AnswerJSON,[]),autoCorrect:String(x.AutoCorrect)==="YES",adminPoints:x.AdminPoints===""?null:Number(x.AdminPoints),adminNote:String(x.AdminNote||"")}))})).reverse()};
}
function quizAdminGrade_(b) {
  quizRequireAdmin_(b.token);const attempt=quizRows_("QuizAttempts").find(x=>String(x.AttemptID)===String(b.attemptId));if(!attempt)throw new Error("Attempt not found.");
  const answers=quizRows_("QuizAnswers").filter(x=>String(x.AttemptID)===String(b.attemptId));let total=0;
  answers.forEach(a=>{const item=(b.answers||[]).find(x=>Number(x.questionNo)===Number(a.QuestionNo));const question=quizRows_("QuizQuestions").find(q=>String(q.QuizID)===String(attempt.QuizID)&&Number(q.QuestionNo)===Number(a.QuestionNo));const score=a.AutoCorrect==="YES"?(Number(question&&question.Points)||1):Math.max(0,Number(item&&item.points)||0);total+=score;quizSheet_("QuizAnswers").getRange(a._row,7,1,2).setValues([[score,String(item&&item.note||"").slice(0,300)]]);});
  quizSheet_("QuizAttempts").getRange(attempt._row,8,1,3).setValues([["Reviewed",total,total]]);return {success:true,finalScore:total};
}
function quizAdminSaveQuestion_(b) {
  quizRequireAdmin_(b.token);const q=b.question||{};if(!q.quizId||!q.question||!q.type||!Number(q.number))throw new Error("Question fields are incomplete.");
  const s=quizSheet_("QuizQuestions"), existing=quizRows_("QuizQuestions").find(x=>String(x.QuizID)===String(q.quizId)&&Number(x.QuestionNo)===Number(q.number));
  const row=[String(q.quizId),Number(q.number),String(q.type),String(q.question).slice(0,1000),JSON.stringify(q.options||[]),JSON.stringify(q.correctAnswers||[]),Math.max(10,Math.min(300,Number(q.seconds)||30)),Math.max(0,Number(q.points)||1),String(q.mediaURL||""),q.active===false?false:true];
  if(existing)s.getRange(existing._row,1,1,row.length).setValues([row]);else s.appendRow(row);return {success:true};
}
function quizAdminResetMemberPassword_(b) {
  quizRequireAdmin_(b.token);const mobile=String(b.mobile||"").replace(/\D/g,"");const member=quizMemberByMobile_(mobile);if(!member)throw new Error("No member account found for that mobile.");
  const temp=Utilities.getUuid().replace(/-/g,"").slice(0,12),salt=Utilities.getUuid();quizSheet_("QuizMembers").getRange(member._row,4,1,3).setValues([[salt,quizHash_(temp,salt),""]]);
  return {success:true,temporaryPassword:temp,name:String(member.Name)};
}
