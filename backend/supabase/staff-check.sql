-- Diagnostic: show staff rows + which logins are linked.
select id, name, role, auth_user_id, created_at from staff order by created_at;
