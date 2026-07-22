import resend

resend.api_key = "re_ZdGZiwcm_DG4RC9eRoWr8g9xipAcsSsq5"

r = resend.Emails.send({
  "from": "onboarding@resend.dev",
  "to": "trevorblevins@gmail.com",
  "subject": "Hello World",
  "html": "<p>Congrats on sending your <strong>first email</strong>!</p>"
})