-- Add customer_email column to orders table
alter table public.orders
  add column if not exists customer_email text;

-- Clean up any empty strings
update public.orders set customer_email = null where customer_email = '';

-- Make customer_email required
alter table public.orders
  alter column customer_email set not null;

-- Add email format validation constraint
alter table public.orders
  add constraint valid_email
  check (customer_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- Add index for email lookups
create index if not exists idx_orders_customer_email on public.orders(customer_email);
