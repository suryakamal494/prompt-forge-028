REVOKE EXECUTE ON FUNCTION public.get_library_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_library_stats(uuid) TO authenticated;