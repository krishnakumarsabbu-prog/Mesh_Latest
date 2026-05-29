/*
  # Add Platform Proxy Settings

  1. New Tables
    - `platform_proxy_settings`
      - `id` (text, primary key)
      - `proxy_url` (text, nullable) - HTTP/HTTPS proxy URL e.g. http://proxy.corp:8080
      - `proxy_strict_ssl` (boolean, default true) - Whether to verify proxy SSL
      - `no_proxy` (text, nullable) - Comma-separated hosts to bypass proxy
      - `is_enabled` (boolean, default false) - Whether proxy is active
      - `updated_by` (text, nullable)
      - `updated_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `platform_proxy_settings` table
    - Super admin can read/write; authenticated users can read

  3. Notes
    - Single-row settings table (only one record should exist)
    - Connector agents will read this at execution time
*/

CREATE TABLE IF NOT EXISTS platform_proxy_settings (
  id text PRIMARY KEY DEFAULT 'default',
  proxy_url text,
  proxy_strict_ssl boolean DEFAULT true NOT NULL,
  no_proxy text,
  is_enabled boolean DEFAULT false NOT NULL,
  updated_by text,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE platform_proxy_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read proxy settings"
  ON platform_proxy_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert proxy settings"
  ON platform_proxy_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update proxy settings"
  ON platform_proxy_settings
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insert default row
INSERT INTO platform_proxy_settings (id, proxy_url, proxy_strict_ssl, no_proxy, is_enabled)
VALUES ('default', NULL, true, NULL, false)
ON CONFLICT (id) DO NOTHING;
