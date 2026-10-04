const SPREADSHEET_ID = '1HA9tygymycRV9DxaHvctOm3LfblOGSXbvOp0z2M-qC4'

// Tabs are ordered most recent first, as in the Google Sheet.
export const tournamentArchives = [
  { gid: '1699022510' },
  { gid: '1594103576' },
  { gid: '1174869059' },
  { gid: '1574758224' },
  { gid: '1296726781' },
  { gid: '1710793513' },
  { gid: '1151328581' },
  { gid: '577870551' },
  { gid: '1967745773' },
  { gid: '0' },
].map((tournament) => ({ spreadsheetId: SPREADSHEET_ID, hasHeader: true, ...tournament }))
