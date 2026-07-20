const http = require('http');
const { Client } = require('pg');

const client = new Client({
  host: '127.0.0.1',
  port: 5432,
  user: 'dairy',
  password: 'local_dev_password',
  database: 'dairy',
});

async function connect() {
  await client.connect();
  console.log('Connected to PostgreSQL');
}

connect().catch(console.error);

const PORT = 8081;

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (req.url === '/' || req.url === '/index.html') {
    res.end(`<!DOCTYPE html>
<html>
<head>
  <title>DairyOS Database Browser</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .header h1 { font-size: 24px; }
    .tabs { display: flex; gap: 10px; margin-bottom: 20px; }
    .tab { padding: 10px 20px; background: white; border: 1px solid #e5e7eb; border-radius: 6px; cursor: pointer; }
    .tab.active { background: #2563eb; color: white; }
    .card { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
    th { background: #f3f4f6; font-weight: bold; }
    tr:hover { background: #f9fafb; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; background: #dbeafe; color: #1e40af; font-size: 11px; }
    .btn { padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; }
    .btn:hover { background: #1d4ed8; }
    input, select { padding: 8px; border: 1px solid #e5e7eb; border-radius: 6px; margin-right: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>DairyOS Database Browser</h1>
    <p>PostgreSQL Database: dairy | User: dairy | Host: localhost:5432</p>
  </div>

  <div class="tabs">
    <div class="tab active" onclick="showSection('tables')">Tables</div>
    <div class="tab" onclick="showSection('query')">Query</div>
    <div class="tab" onclick="showSection('info')">Info</div>
  </div>

  <div id="tables-section" class="card">
    <h2>Database Tables</h2>
    <div id="tables-list">Loading...</div>
  </div>

  <div id="query-section" class="card" style="display:none;">
    <h2>Run Query</h2>
    <input type="text" id="query-input" placeholder="SELECT * FROM users LIMIT 10;" style="width: 100%; padding: 10px; margin-bottom: 10px; font-family: monospace;" />
    <button class="btn" onclick="runQuery()">Execute</button>
    <div id="query-result" style="margin-top: 20px;"></div>
  </div>

  <div id="info-section" class="card" style="display:none;">
    <h2>Database Info</h2>
    <div id="info-content">Loading...</div>
  </div>

  <script>
    function showSection(section) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.card').forEach(c => c.style.display = 'none');
      if (section === 'tables') {
        document.querySelectorAll('.tab')[0].classList.add('active');
        document.getElementById('tables-section').style.display = 'block';
        loadTables();
      } else if (section === 'query') {
        document.querySelectorAll('.tab')[1].classList.add('active');
        document.getElementById('query-section').style.display = 'block';
      } else {
        document.querySelectorAll('.tab')[2].classList.add('active');
        document.getElementById('info-section').style.display = 'block';
        loadInfo();
      }
    }

    async function loadTables() {
      const res = await fetch('/api/tables');
      const data = await res.json();
      let html = '<table><tr><th>Table</th><th>Rows</th><th>Actions</th></tr>';
      for (const table of data.tables) {
        html += '<tr><td><strong>' + table.name + '</strong></td><td>' + table.count + '</td><td><button class="btn" onclick="loadTableData(\\'' + table.name + '\\')">View</button></td></tr>';
      }
      html += '</table>';
      document.getElementById('tables-list').innerHTML = html;
    }

    async function loadTableData(table) {
      const res = await fetch('/api/table/' + table + '?limit=50');
      const data = await res.json();
      let html = '<h3>' + table + ' (' + data.rows.length + ' rows)</h3>';
      if (data.rows.length > 0) {
        html += '<table><tr>';
        for (const col of data.columns) {
          html += '<th>' + col + '</th>';
        }
        html += '</tr>';
        for (const row of data.rows) {
          html += '<tr>';
          for (const col of data.columns) {
            html += '<td>' + (row[col] !== null ? row[col] : '<em>NULL</em>') + '</td>';
          }
          html += '</tr>';
        }
        html += '</table>';
      } else {
        html += '<p>No data</p>';
      }
      document.getElementById('tables-list').innerHTML = html;
    }

    async function runQuery() {
      const query = document.getElementById('query-input').value;
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      let html = '';
      if (data.error) {
        html = '<p style="color: red;">Error: ' + data.error + '</p>';
      } else if (data.rows.length > 0) {
        html = '<table><tr>';
        for (const col of data.columns) {
          html += '<th>' + col + '</th>';
        }
        html += '</tr>';
        for (const row of data.rows) {
          html += '<tr>';
          for (const col of data.columns) {
            html += '<td>' + (row[col] !== null ? row[col] : '<em>NULL</em>') + '</td>';
          }
          html += '</tr>';
        }
        html += '</table>';
      } else {
        html = '<p>Query executed successfully. No rows returned.</p>';
      }
      document.getElementById('query-result').innerHTML = html;
    }

    async function loadInfo() {
      const res = await fetch('/api/info');
      const data = await res.json();
      document.getElementById('info-content').innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
    }

    loadTables();
  </script>
</body>
</html>`);
  } else if (req.url === '/api/tables') {
    try {
      const result = await client.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      const tables = [];
      for (const row of result.rows) {
        const countRes = await client.query('SELECT COUNT(*) FROM ' + row.table_name);
        tables.push({ name: row.table_name, count: countRes.rows[0].count });
      }
      res.end(JSON.stringify({ tables }));
    } catch (err) {
      res.end(JSON.stringify({ error: err.message }));
    }
  } else if (req.url.startsWith('/api/table/')) {
    const table = decodeURIComponent(req.url.split('/')[3]).split('?')[0];
    try {
      const limit = req.url.includes('limit=') ? req.url.split('limit=')[1].split('&')[0] : '50';
      const result = await client.query('SELECT * FROM ' + table + ' LIMIT ' + limit);
      const columns = result.fields.map(f => f.name);
      res.end(JSON.stringify({ columns, rows: result.rows }));
    } catch (err) {
      res.end(JSON.stringify({ error: err.message }));
    }
  } else if (req.url === '/api/query' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { query } = JSON.parse(body);
        const result = await client.query(query);
        const columns = result.fields.map(f => f.name);
        res.end(JSON.stringify({ columns, rows: result.rows }));
      } catch (err) {
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else if (req.url === '/api/info') {
    try {
      const version = await client.query('SELECT version()');
      const size = await client.query('SELECT pg_size_pretty(pg_database_size(current_database()))');
      res.end(JSON.stringify({
        version: version.rows[0].version,
        database: size.rows[0].pg_size_pretty,
        user: 'dairy',
        host: 'localhost:5432'
      }));
    } catch (err) {
      res.end(JSON.stringify({ error: err.message }));
    }
  } else {
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log('Database browser running at http://localhost:' + PORT);
});
