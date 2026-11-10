-- DomiFlix: separa a arte horizontal da biblioteca da arte vertical do player.
-- Atualização aditiva: não altera vídeos, progresso, classificação ou acesso.

WITH covers(title_id, banner_url, thumbnail_url) AS (
  VALUES
    ('d0000000-0000-4000-8000-000000000000'::uuid, '/images/domiflix/tutorial-covers/t0-horizontal.jpg',  '/images/domiflix/tutorial-covers/t0-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000001'::uuid, '/images/domiflix/tutorial-covers/t1-horizontal.jpg',  '/images/domiflix/tutorial-covers/t1-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000002'::uuid, '/images/domiflix/tutorial-covers/t2-horizontal.jpg',  '/images/domiflix/tutorial-covers/t2-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000003'::uuid, '/images/domiflix/tutorial-covers/t3-horizontal.jpg',  '/images/domiflix/tutorial-covers/t3-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000004'::uuid, '/images/domiflix/tutorial-covers/t4-horizontal.jpg',  '/images/domiflix/tutorial-covers/t4-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000005'::uuid, '/images/domiflix/tutorial-covers/t5-horizontal.jpg',  '/images/domiflix/tutorial-covers/t5-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000007'::uuid, '/images/domiflix/tutorial-covers/t7-horizontal.jpg',  '/images/domiflix/tutorial-covers/t7-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000018'::uuid, '/images/domiflix/tutorial-covers/t18-horizontal.jpg', '/images/domiflix/tutorial-covers/t18-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000008'::uuid, '/images/domiflix/tutorial-covers/t8-horizontal.jpg',  '/images/domiflix/tutorial-covers/t8-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000009'::uuid, '/images/domiflix/tutorial-covers/t9-horizontal.jpg',  '/images/domiflix/tutorial-covers/t9-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000010'::uuid, '/images/domiflix/tutorial-covers/t10-horizontal.jpg', '/images/domiflix/tutorial-covers/t10-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000011'::uuid, '/images/domiflix/tutorial-covers/t11-horizontal.jpg', '/images/domiflix/tutorial-covers/t11-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000012'::uuid, '/images/domiflix/tutorial-covers/t12-horizontal.jpg', '/images/domiflix/tutorial-covers/t12-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000013'::uuid, '/images/domiflix/tutorial-covers/t13-horizontal.jpg', '/images/domiflix/tutorial-covers/t13-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000019'::uuid, '/images/domiflix/tutorial-covers/t19-horizontal.jpg', '/images/domiflix/tutorial-covers/t19-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000020'::uuid, '/images/domiflix/tutorial-covers/t20-horizontal.jpg', '/images/domiflix/tutorial-covers/t20-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000014'::uuid, '/images/domiflix/tutorial-covers/t14-horizontal.jpg', '/images/domiflix/tutorial-covers/t14-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000015'::uuid, '/images/domiflix/tutorial-covers/t15-horizontal.jpg', '/images/domiflix/tutorial-covers/t15-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000017'::uuid, '/images/domiflix/tutorial-covers/t17-horizontal.jpg', '/images/domiflix/tutorial-covers/t17-vertical.jpg')
)
UPDATE public.domiflix_titles AS title
SET
  banner_url = covers.banner_url,
  thumbnail_url = covers.thumbnail_url,
  updated_at = now()
FROM covers
WHERE title.id = covers.title_id;

WITH covers(title_id, thumbnail_url) AS (
  VALUES
    ('d0000000-0000-4000-8000-000000000000'::uuid, '/images/domiflix/tutorial-covers/t0-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000001'::uuid, '/images/domiflix/tutorial-covers/t1-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000002'::uuid, '/images/domiflix/tutorial-covers/t2-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000003'::uuid, '/images/domiflix/tutorial-covers/t3-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000004'::uuid, '/images/domiflix/tutorial-covers/t4-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000005'::uuid, '/images/domiflix/tutorial-covers/t5-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000007'::uuid, '/images/domiflix/tutorial-covers/t7-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000018'::uuid, '/images/domiflix/tutorial-covers/t18-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000008'::uuid, '/images/domiflix/tutorial-covers/t8-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000009'::uuid, '/images/domiflix/tutorial-covers/t9-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000010'::uuid, '/images/domiflix/tutorial-covers/t10-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000011'::uuid, '/images/domiflix/tutorial-covers/t11-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000012'::uuid, '/images/domiflix/tutorial-covers/t12-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000013'::uuid, '/images/domiflix/tutorial-covers/t13-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000019'::uuid, '/images/domiflix/tutorial-covers/t19-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000020'::uuid, '/images/domiflix/tutorial-covers/t20-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000014'::uuid, '/images/domiflix/tutorial-covers/t14-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000015'::uuid, '/images/domiflix/tutorial-covers/t15-vertical.jpg'),
    ('d0000000-0000-4000-8000-000000000017'::uuid, '/images/domiflix/tutorial-covers/t17-vertical.jpg')
)
UPDATE public.domiflix_episodes AS episode
SET thumbnail_url = covers.thumbnail_url
FROM covers
WHERE episode.title_id = covers.title_id;
