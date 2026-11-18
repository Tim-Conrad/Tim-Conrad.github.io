# Voice script: no-long-lived-secrets

One line per scene. Made by render.mjs from the `say` lines in `no-long-lived-secrets.js`: change them there.
The film is 2:47.0 long. No audio exists yet.

## 0 · Title (0:00.0, 6.2 s)

Agents without long-lived secrets, approved from my phone. A thought by Tim Conrad.

## 1 · Keys that live for years (0:06.2, 13 s)

My agents run as me. They can read keys that never expire. An agent does not need to be evil to leak one: it prints a variable while it debugs.

## 2 · A secret is something you can copy (0:19.2, 15 s)

A bearer token is like a cinema ticket. Whoever shows it gets in. So when another machine has a copy from a log, the API accepts the copy too. It cannot tell the two apart.

## 3 · A token bound to a key (0:34.2, 21 s)

DPoP binds the token to a key pair. The private key never leaves the agent’s process. With each request, the agent signs a fresh proof: one method, one URL, a short time, once. Another machine with a copy has no key, so it has no proof. The API rejects it.

## 4 · Five parts, and the APIs they protect (0:55.2, 20.2 s)

The design has five parts. On my machine, a broker finds out which program is asking. A relay passes the sealed request to my phone. I approve, and the phone signs a grant. A gateway checks each request and adds the real key. The agent never sees it.

## 5 · Show the intent, not a button (1:15.4, 24.2 s)

The phone shows what the agent wants to do. Who asks, as the broker checked it. What exactly it wants. Why, in the agent’s own words, which is a claim and not a fact. How far the grant goes. A code that also shows in my terminal. Then my fingerprint, and the phone signs exactly what it shows.

## 6 · One request, from the agent to GitHub (1:39.6, 32.6 s)

One push, step by step. The agent asks the broker, and the broker checks which program it is. The request reaches my phone, sealed. I read it and approve. The phone signs a grant: this agent, this push, two hours at most. The gateway checks the grant, the proof and the request. Then it adds a short token of its own, which the agent never sees. A push to main is outside the grant, so the gateway refuses it.

## 7 · How long each credential lives (2:12.2, 18.2 s)

Today, an agent can read four kinds of keys, and they are valid until I rotate them. With grants, the lifetimes are minutes and hours. Only the upstream keys stay long-lived, and they stay in the gateway, where no agent can read them.

## 8 · in short (2:30.4, 16.6 s)

In short: a key that cannot be copied replaces the secret. The phone signs a narrow, short grant for what the agent means to do. And the last static keys move into one gateway that no agent can read.
