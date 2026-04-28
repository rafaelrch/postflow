import { NextResponse } from 'next/server';
import { POSTFLOW_DATABASE_SCHEMA } from '@/lib/database-schema';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Executes a SQL statement via Supabase's internal pg-meta API
async function execSQL(sql: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ query: sql }),
  });
  return res;
}

// Alternative: use pg-meta admin endpoint
async function execSQLAdmin(sql: string) {
  const ref = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  return res;
}

export async function GET() {
  const schema = POSTFLOW_DATABASE_SCHEMA;

  try {
    const rpcRes = await execSQL(schema);
    if (rpcRes.ok) {
      return NextResponse.json({ ok: true, message: 'Banco de dados configurado com sucesso!' });
    }

    const rpcBody = await rpcRes.text();
    const adminRes = await execSQLAdmin(schema);
    const adminBody = await adminRes.text();

    if (adminRes.ok) {
      return NextResponse.json({ ok: true, message: 'Banco de dados configurado com sucesso!' });
    }

    return NextResponse.json({
      ok: false,
      status: adminRes.status,
      body: adminBody,
      rpcStatus: rpcRes.status,
      rpcBody,
      sql: schema,
      instructions: 'Cole o SQL acima no Supabase Dashboard → SQL Editor e execute.',
    }, { status: 200 });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: String(err),
      sql: schema,
      instructions: 'Cole o SQL abaixo no Supabase Dashboard → SQL Editor e execute.',
    }, { status: 200 });
  }
}
