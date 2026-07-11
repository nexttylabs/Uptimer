-- Status-page branding is authoritative; retire the legacy global branding keys.
DELETE FROM settings
WHERE key IN ('site_title', 'site_description');
