--
-- PostgreSQL database dump
--

\restrict Byp4XEWAd0JIMC7TUh3C2IGkQR79MkpidqUZfhuBpm2r8uxIvQ0te2HsfDdPVSv

-- Dumped from database version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: game_status; Type: TYPE; Schema: public; Owner: turntable
--

CREATE TYPE public.game_status AS ENUM (
    'waiting',
    'active',
    'won',
    'draw',
    'cancelled'
);


ALTER TYPE public.game_status OWNER TO turntable;

--
-- Name: game_type; Type: TYPE; Schema: public; Owner: turntable
--

CREATE TYPE public.game_type AS ENUM (
    'tic_tac_toe',
    'pushfight'
);


ALTER TYPE public.game_type OWNER TO turntable;

--
-- Name: player_mark; Type: TYPE; Schema: public; Owner: turntable
--

CREATE TYPE public.player_mark AS ENUM (
    'X',
    'O'
);


ALTER TYPE public.player_mark OWNER TO turntable;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account; Type: TABLE; Schema: public; Owner: turntable
--

CREATE TABLE public.account (
    id text NOT NULL,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp with time zone,
    "refreshTokenExpiresAt" timestamp with time zone,
    scope text,
    password text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public.account OWNER TO turntable;

--
-- Name: game_players; Type: TABLE; Schema: public; Owner: turntable
--

CREATE TABLE public.game_players (
    game_id uuid NOT NULL,
    user_id text NOT NULL,
    mark public.player_mark NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.game_players OWNER TO turntable;

--
-- Name: games; Type: TABLE; Schema: public; Owner: turntable
--

CREATE TABLE public.games (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by text NOT NULL,
    status public.game_status DEFAULT 'waiting'::public.game_status NOT NULL,
    game_type public.game_type DEFAULT 'tic_tac_toe'::public.game_type NOT NULL,
    winner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.games OWNER TO turntable;

--
-- Name: moves; Type: TABLE; Schema: public; Owner: turntable
--

CREATE TABLE public.moves (
    id bigint NOT NULL,
    game_id uuid NOT NULL,
    player_id text NOT NULL,
    "position" smallint,
    move_number smallint NOT NULL,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.moves OWNER TO turntable;

--
-- Name: moves_id_seq; Type: SEQUENCE; Schema: public; Owner: turntable
--

ALTER TABLE public.moves ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.moves_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: session; Type: TABLE; Schema: public; Owner: turntable
--

CREATE TABLE public.session (
    id text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    token text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "userId" text NOT NULL
);


ALTER TABLE public.session OWNER TO turntable;

--
-- Name: user; Type: TABLE; Schema: public; Owner: turntable
--

CREATE TABLE public."user" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    "emailVerified" boolean NOT NULL,
    image text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    username text,
    "displayUsername" text
);


ALTER TABLE public."user" OWNER TO turntable;

--
-- Name: verification; Type: TABLE; Schema: public; Owner: turntable
--

CREATE TABLE public.verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.verification OWNER TO turntable;

--
-- Data for Name: account; Type: TABLE DATA; Schema: public; Owner: turntable
--

COPY public.account (id, "accountId", "providerId", "userId", "accessToken", "refreshToken", "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", scope, password, "createdAt", "updatedAt") FROM stdin;
Cnjd1uaEvsoQcIwZF8BQhJ8wvQB1YZLD	phQnhEyVrr3fw6adoF40skKGYEOnuc5c	credential	phQnhEyVrr3fw6adoF40skKGYEOnuc5c	\N	\N	\N	\N	\N	\N	f95d51649fc1d12b3db218494ce6d957:7b808048370b9a6b6f065ec622ba81405a0b84dbf6dfab20d9efa197b059725b35b9b9932af4b678bc229922dff6ea7b36b7e9c0238321fe58e56d610eed4e7d	2026-08-08 16:08:42.505-06	2026-08-08 16:08:42.505-06
8OZPrnvq68wQo4NHutaowhEAH7mxbbrQ	oRsfgA2igPJbG12vxZGxKyMfX4ZxKYQh	credential	oRsfgA2igPJbG12vxZGxKyMfX4ZxKYQh	\N	\N	\N	\N	\N	\N	b323c1f51487c12ef7bf52a74aba4194:149ad952e6b7260240bd25531edde2cf8c5e71a6aca15a25633387c332e66a8fce66bc770c7a6e3ed66c263d85bdf8ab935ef015c934c1815ffbfd28b4dffd7f	2026-08-08 16:09:13.412-06	2026-08-08 16:09:13.412-06
\.


--
-- Data for Name: game_players; Type: TABLE DATA; Schema: public; Owner: turntable
--

COPY public.game_players (game_id, user_id, mark, joined_at) FROM stdin;
c378c619-20ed-4b30-aa7e-dd11c5acad13	oRsfgA2igPJbG12vxZGxKyMfX4ZxKYQh	X	2026-08-08 16:09:23.180781-06
c378c619-20ed-4b30-aa7e-dd11c5acad13	phQnhEyVrr3fw6adoF40skKGYEOnuc5c	O	2026-08-08 16:09:23.180781-06
\.


--
-- Data for Name: games; Type: TABLE DATA; Schema: public; Owner: turntable
--

COPY public.games (id, created_by, status, game_type, winner_id, created_at, updated_at) FROM stdin;
c378c619-20ed-4b30-aa7e-dd11c5acad13	oRsfgA2igPJbG12vxZGxKyMfX4ZxKYQh	active	pushfight	\N	2026-08-08 16:09:23.180781-06	2026-08-09 10:14:04.85653-06
\.


--
-- Data for Name: moves; Type: TABLE DATA; Schema: public; Owner: turntable
--

COPY public.moves (id, game_id, player_id, "position", move_number, payload, created_at) FROM stdin;
1	c378c619-20ed-4b30-aa7e-dd11c5acad13	oRsfgA2igPJbG12vxZGxKyMfX4ZxKYQh	\N	1	{"to": 1, "from": 0, "type": "move"}	2026-08-09 10:13:58.981408-06
2	c378c619-20ed-4b30-aa7e-dd11c5acad13	oRsfgA2igPJbG12vxZGxKyMfX4ZxKYQh	\N	2	{"to": 1, "from": 0, "type": "move"}	2026-08-09 10:14:04.85653-06
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: turntable
--

COPY public.session (id, "expiresAt", token, "createdAt", "updatedAt", "ipAddress", "userAgent", "userId") FROM stdin;
wgj94uMGy4sRUwvPJ7QPqpt0jow9DsB4	2026-08-15 16:08:42.527-06	3m7CQpx30kXNKhYISfxZrhPYu49GD05Z	2026-08-08 16:08:42.527-06	2026-08-08 16:08:42.527-06	192.168.1.48	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	phQnhEyVrr3fw6adoF40skKGYEOnuc5c
hYSrnNxAEyYLtFqNl0IyXxKlU9w8p2Yq	2026-08-15 16:09:13.433-06	fRujmj54lUS12ueI4lMhLjVCttaLX7gg	2026-08-08 16:09:13.433-06	2026-08-08 16:09:13.433-06	192.168.1.48	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	oRsfgA2igPJbG12vxZGxKyMfX4ZxKYQh
UiOERF3UUaH5KrslPlj2LGywMPnt1pzL	2026-08-16 20:18:32.052-06	IRIvpH2Vy96cD6K0JvFkoJMhOHV8DTnH	2026-08-09 20:18:32.052-06	2026-08-09 20:18:32.052-06	192.168.1.48	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	phQnhEyVrr3fw6adoF40skKGYEOnuc5c
3gqHrQNh3A73y7GlKLG67WLanoZyL8Of	2026-08-16 20:51:29.024-06	5dzfOJSYfEB67eL1MRuwPQUcmJSlq6sz	2026-08-09 20:51:29.024-06	2026-08-09 20:51:29.024-06	192.168.1.48	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	phQnhEyVrr3fw6adoF40skKGYEOnuc5c
FyTUEkN8cHPAl5aBbOnDT4VZ2EDcq2En	2026-08-16 20:51:43.04-06	wNmebN7CZGiQlTYDwAqFym38O7V9V64B	2026-08-09 20:51:43.04-06	2026-08-09 20:51:43.04-06	192.168.1.48	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	oRsfgA2igPJbG12vxZGxKyMfX4ZxKYQh
\.


--
-- Data for Name: user; Type: TABLE DATA; Schema: public; Owner: turntable
--

COPY public."user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt", username, "displayUsername") FROM stdin;
phQnhEyVrr3fw6adoF40skKGYEOnuc5c	IMathGood	gregnorgard@gmail.com	f	\N	2026-08-08 16:08:42.481-06	2026-08-08 16:08:42.481-06	IMathGood	IMathGood
oRsfgA2igPJbG12vxZGxKyMfX4ZxKYQh	Test	noone@nowhere.com	f	\N	2026-08-08 16:09:13.391-06	2026-08-08 16:09:13.391-06	Test	Test
\.


--
-- Data for Name: verification; Type: TABLE DATA; Schema: public; Owner: turntable
--

COPY public.verification (id, identifier, value, "expiresAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Name: moves_id_seq; Type: SEQUENCE SET; Schema: public; Owner: turntable
--

SELECT pg_catalog.setval('public.moves_id_seq', 2, true);


--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- Name: game_players game_players_game_id_mark_key; Type: CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public.game_players
    ADD CONSTRAINT game_players_game_id_mark_key UNIQUE (game_id, mark);


--
-- Name: game_players game_players_pkey; Type: CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public.game_players
    ADD CONSTRAINT game_players_pkey PRIMARY KEY (game_id, user_id);


--
-- Name: games games_pkey; Type: CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_pkey PRIMARY KEY (id);


--
-- Name: moves moves_game_id_move_number_key; Type: CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public.moves
    ADD CONSTRAINT moves_game_id_move_number_key UNIQUE (game_id, move_number);


--
-- Name: moves moves_game_id_position_key; Type: CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public.moves
    ADD CONSTRAINT moves_game_id_position_key UNIQUE (game_id, "position");


--
-- Name: moves moves_pkey; Type: CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public.moves
    ADD CONSTRAINT moves_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- Name: session session_token_key; Type: CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_token_key UNIQUE (token);


--
-- Name: user user_email_key; Type: CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_email_key UNIQUE (email);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: user user_username_key; Type: CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_username_key UNIQUE (username);


--
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- Name: account_userId_idx; Type: INDEX; Schema: public; Owner: turntable
--

CREATE INDEX "account_userId_idx" ON public.account USING btree ("userId");


--
-- Name: game_players_user_id_idx; Type: INDEX; Schema: public; Owner: turntable
--

CREATE INDEX game_players_user_id_idx ON public.game_players USING btree (user_id);


--
-- Name: games_created_by_idx; Type: INDEX; Schema: public; Owner: turntable
--

CREATE INDEX games_created_by_idx ON public.games USING btree (created_by);


--
-- Name: moves_game_id_idx; Type: INDEX; Schema: public; Owner: turntable
--

CREATE INDEX moves_game_id_idx ON public.moves USING btree (game_id);


--
-- Name: session_userId_idx; Type: INDEX; Schema: public; Owner: turntable
--

CREATE INDEX "session_userId_idx" ON public.session USING btree ("userId");


--
-- Name: verification_identifier_idx; Type: INDEX; Schema: public; Owner: turntable
--

CREATE INDEX verification_identifier_idx ON public.verification USING btree (identifier);


--
-- Name: account account_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: game_players game_players_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public.game_players
    ADD CONSTRAINT game_players_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;


--
-- Name: game_players game_players_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public.game_players
    ADD CONSTRAINT game_players_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: games games_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id);


--
-- Name: games games_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public."user"(id);


--
-- Name: moves moves_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public.moves
    ADD CONSTRAINT moves_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;


--
-- Name: moves moves_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public.moves
    ADD CONSTRAINT moves_player_id_fkey FOREIGN KEY (player_id) REFERENCES public."user"(id);


--
-- Name: session session_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: turntable
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict Byp4XEWAd0JIMC7TUh3C2IGkQR79MkpidqUZfhuBpm2r8uxIvQ0te2HsfDdPVSv

