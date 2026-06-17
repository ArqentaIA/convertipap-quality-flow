
ALTER FUNCTION public.fn_cumplimiento_variables_rollo_v2(uuid) SECURITY INVOKER;
ALTER FUNCTION public.fn_cumplimiento_turno_v2(uuid, text, date) SECURITY INVOKER;

ALTER VIEW public.v_muestra_kpis_v2 SET (security_invoker = true);
ALTER VIEW public.v_turno_kpis_v2  SET (security_invoker = true);
