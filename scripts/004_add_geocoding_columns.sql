-- Add geocoding metadata columns to orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS geocode_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS geocode_label     TEXT,
  ADD COLUMN IF NOT EXISTS geocode_status    TEXT;

-- Ensure lat/lng are proper numeric types
ALTER TABLE public.orders
  ALTER COLUMN latitude TYPE DOUBLE PRECISION USING latitude::DOUBLE PRECISION,
  ALTER COLUMN longitude TYPE DOUBLE PRECISION USING longitude::DOUBLE PRECISION;

-- Add index for geocoding status queries
CREATE INDEX IF NOT EXISTS idx_orders_geocode_status ON public.orders(geocode_status);
