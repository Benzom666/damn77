-- Drop existing policies that cause recursion
drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Admins can do everything with orders" on public.orders;
drop policy if exists "Drivers can view their assigned orders" on public.orders;
drop policy if exists "Drivers can update their assigned orders" on public.orders;
drop policy if exists "Admins can do everything with routes" on public.routes;
drop policy if exists "Drivers can view their assigned routes" on public.routes;
drop policy if exists "Admins can view all PODs" on public.pods;
drop policy if exists "Drivers can insert PODs for their orders" on public.pods;
drop policy if exists "Admins can view all stop events" on public.stop_events;
drop policy if exists "Drivers can insert stop events for their orders" on public.stop_events;

-- Create a security definer function to get user role (bypasses RLS)
create or replace function public.get_user_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Recreate profiles policies without recursion
create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.get_user_role() = 'admin');

-- Recreate orders policies
create policy "Admins can do everything with orders"
  on public.orders for all
  using (public.get_user_role() = 'admin');

create policy "Drivers can view their assigned orders"
  on public.orders for select
  using (
    public.get_user_role() = 'driver' and
    exists (
      select 1 from public.routes r
      where r.id = orders.route_id and r.driver_id = auth.uid()
    )
  );

create policy "Drivers can update their assigned orders"
  on public.orders for update
  using (
    public.get_user_role() = 'driver' and
    exists (
      select 1 from public.routes r
      where r.id = orders.route_id and r.driver_id = auth.uid()
    )
  );

-- Recreate routes policies
create policy "Admins can do everything with routes"
  on public.routes for all
  using (public.get_user_role() = 'admin');

create policy "Drivers can view their assigned routes"
  on public.routes for select
  using (
    driver_id = auth.uid() or
    public.get_user_role() = 'admin'
  );

-- Recreate PODs policies
create policy "Admins can view all PODs"
  on public.pods for select
  using (public.get_user_role() = 'admin');

create policy "Drivers can insert PODs for their orders"
  on public.pods for insert
  with check (
    driver_id = auth.uid() and
    public.get_user_role() = 'driver'
  );

-- Recreate stop events policies
create policy "Admins can view all stop events"
  on public.stop_events for select
  using (public.get_user_role() = 'admin');

create policy "Drivers can insert stop events for their orders"
  on public.stop_events for insert
  with check (
    driver_id = auth.uid() and
    public.get_user_role() = 'driver'
  );
