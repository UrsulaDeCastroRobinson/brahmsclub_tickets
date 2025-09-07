import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const transporter = nodemailer.createTransport({
  host: "smtp.porkbun.com", // or mail.brahmsclub.org
  port: 465,              // use 465 for SSL; use 587 for TLS/STARTTLS
  secure: true,           // true for 465 (SSL), false for 587 (TLS)
  auth: {
    user: process.env.SMTP_USER, // set to tom.hosted@brahmsclub.org in your .env
    pass: process.env.SMTP_PASS, // mailbox password in your .env
  },
});



export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { name, quantity, date, amount, email } = req.body;
  if (!name || !quantity || !date || !amount || !email)
    return res.status(400).json({ error: "Missing fields" });

  const ticketNumber = crypto.randomBytes(5).toString("hex").toUpperCase();
  const ticketInfo = {
    concert_name: "Brahms club - complete chamber works",
    date,
    name,
	quantity,
	email: email,
    address: "The Chapel, The Royal Foundation of St Katharine",
    amount,
    ticket_number: ticketNumber,
  };

  // Save to Supabase
  const { error } = await supabase.from("tickets").insert([ticketInfo]);
  if (error) return res.status(500).json({ error: "Database error" });

  // Send email
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: "Your Brahms Club Ticket",
    text: `
Dear ${name}

Thank you for booking this concert as part of the Brahms Club's cycle of complete chamber works, generously hosted by ${ticketInfo.address}.

Ticket details:

Concert series: ${ticketInfo.concert_name}
Date: ${date}
Name: ${name}
Number of tickets: ${quantity}
Email: ${email}
Venue: ${ticketInfo.address}
Donation: £${amount}
Ticket Number: ${ticketNumber}


We look forward to welcoming you at ${ticketInfo.address} on ${date}.

Please show this email or state your name at the entrance. There is no separate ticket.

"It felt strange when I beheld the wooded heights once more and walked into the magnificent forest. I have not seen nature this beautiful for a year. 
Much has changed since then. 
Yet I was completely happy. 
I only thought of music. I am in love with music, I love music, I think of nothing but, and of other things only when they make music more beautiful for me...
If it continues like this I may evaporate into a chord and float off into the air." 
-- Johannes Brahms,9 October 1859
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Email error" });
  }
}