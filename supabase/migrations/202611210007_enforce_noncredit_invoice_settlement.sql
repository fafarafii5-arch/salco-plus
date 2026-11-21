create or replace function private.assert_sale_total_settlement(p_sale_id uuid)
returns void language plpgsql security definer
set search_path=public,private,pg_temp
as $$
declare v_sale public.sales%rowtype;
begin
 select * into v_sale from public.sales where id=p_sale_id;
 if not found or v_sale.status<>'completed' then return; end if;
 if v_sale.payment_method not in ('credit','gift') and v_sale.total<>v_sale.amount_paid then
  raise exception 'مبلغ نهایی فاکتور % باید دقیقاً با مبلغ دریافتی و صندوق برابر باشد. عملیات لغو شد.',v_sale.invoice_no;
 end if;
 if v_sale.payment_method='gift' and (v_sale.total<>0 or v_sale.amount_paid<>0) then
  raise exception 'فاکتور هدیه باید مبلغ نهایی و دریافتی صفر داشته باشد.';
 end if;
end;
$$;
create or replace function private.check_sales_accounting_deferred()
returns trigger language plpgsql security definer
set search_path=public,private,pg_temp
as $$
begin
 if tg_op='DELETE' then
  perform private.assert_sale_accounting_integrity(old.id);
 elsif tg_op='INSERT' then
  perform private.assert_sale_accounting_integrity(new.id);
  perform private.assert_sale_total_settlement(new.id);
 else
  perform private.assert_sale_accounting_integrity(new.id);
  if new.total is distinct from old.total or new.payment_method is distinct from old.payment_method or new.status is distinct from old.status then
   perform private.assert_sale_total_settlement(new.id);
  end if;
 end if;
 return null;
end;
$$;