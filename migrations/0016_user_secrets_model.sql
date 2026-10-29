-- BYO Z.ai text model id (vision uses locked glm-4.6v-flash in adapter)
ALTER TABLE user_secrets ADD COLUMN model TEXT;
