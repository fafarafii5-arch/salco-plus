revoke all on function public.register_sale_multi(uuid,jsonb,timestamptz,numeric,text,numeric,text,jsonb,text,text) from public, anon;
grant execute on function public.register_sale_multi(uuid,jsonb,timestamptz,numeric,text,numeric,text,jsonb,text,text) to authenticated;
