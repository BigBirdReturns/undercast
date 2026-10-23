// Shared bytes are valid only for the same documented performer portrait.
export function documentedPortraitReuse(members,records){
  const rows=members.map(member=>{const [id,side]=member.split(':');return {side,record:records.get(id)};});
  if(!rows.length||rows.some(row=>row.side!=='portrait'||!row.record?.portrait?.origin))return false;
  const key=row=>JSON.stringify([String(row.record.actor||'').normalize('NFKC').trim().toLowerCase(),row.record.portrait.origin]);
  return Boolean(rows[0].record.actor?.trim())&&rows.every(row=>key(row)===key(rows[0]));
}
