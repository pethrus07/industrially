const net = require('net');

const HOST = '192.168.0.8';
const PORT = 6101;

const zpl = `^XA
^XFE:APERAM.ZPL^FS
^FN1^FDFN1^FS
^FN2^FDFN2^FS
^FN3^FDFN3^FS
^FN4^FDFN4^FS
^FN5^FDFN5^FS
^FN6^FDFN6^FS
^FN7^FDFN7^FS
^FN8^FDFN8^FS
^FN9^FDFN9^FS
^FN10^FDFN10^FS
^FN11^FDFN11^FS
^FN12^FDFN12^FS
^FN13^FDFN13^FS
^FN14^FDFN14^FS
^FN15^FDFN15^FS
^FN16^FDFN16^FS
^FN17^FDFN17^FS
^FN18^FDFN18^FS
^FN19^FDFN19^FS
^FN20^FDFN20^FS
^FN21^FDFN21^FS
^FN22^FDFN22^FS
^FN23^FDFN23^FS
^FN24^FDFN24^FS
^FN25^FDFN25^FS
^FN26^FDFN26^FS
^FN27^FDFN27^FS
^FN28^FDFN28^FS
^FN29^FDFN29^FS
^FN30^FDFN30^FS
^FN31^FDFN31^FS
^FN32^FDFN32^FS
^FN33^FDFN33^FS
^FN34^FDFN34^FS
^FN35^FDFN35^FS
^FN36^FDFN36^FS
^FN37^FDFN37^FS
^FN38^FDFN38^FS
^FN39^FDFN39^FS
^FN40^FDFN40^FS
^PQ1
^XZ`;

const client = new net.Socket();

client.connect(PORT, HOST, () => {
    console.log(`Conectado em ${HOST}:${PORT}`);

    client.write(zpl, 'ascii', () => {
        console.log('ZPL enviado com sucesso.');
        client.end();
    });
});

client.on('data', (data) => {
    console.log('Resposta da impressora:');
    console.log(data.toString());
});

client.on('close', () => {
    console.log('Conexão encerrada.');
});

client.on('error', (err) => {
    console.error('Erro na comunicação:', err.message);
});