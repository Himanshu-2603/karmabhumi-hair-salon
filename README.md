# Karmabhumi Hair Salon – live queue

- `index.html` – customer live queue
- `add_appointment.html` – customer page: write your name → thank-you → redirects to the live queue (share this link / QR with customers)
- `admin_salon.html` – owner panel (new self-booked customers appear within ~8 seconds, with a notification)

## Data retention
Only the current month is stored. Last month stays available for the first 7 days of the new month
(example: October records are visible until 7 November, so you can export them) and is then deleted automatically.
Monthly export (PDF / CSV) is in the admin page under "Monthly export".
