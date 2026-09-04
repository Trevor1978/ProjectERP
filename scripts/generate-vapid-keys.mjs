#!/usr/bin/env node
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log("Add these to your API environment (.env or production secrets):\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("VAPID_SUBJECT=mailto:admin@yourdomain.com");
