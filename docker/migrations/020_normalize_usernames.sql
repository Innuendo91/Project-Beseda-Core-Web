-- Normalize existing usernames to lowercase and set display_name from username
UPDATE users SET display_name = username WHERE display_name IS NULL OR display_name = '';
UPDATE users SET username = LOWER(username) WHERE username != LOWER(username);
