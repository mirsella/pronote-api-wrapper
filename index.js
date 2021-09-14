const pronote = require('pronote-api');
const fs = require('fs');
const telegramnotif = require('telegramnotif');
require('dotenv').config();

const url = process.env.url;
const username = process.env.username;
const password = process.env.password;

(async () => {
    const session = await pronote.login(url, username, password);

    const daysName = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
    const timetableStart = new Date();
    const timetableEnd = new Date();
    timetableEnd.setDate(timetableEnd.getDate() + 14);

    /*
     * Const timetableStart = new Date(2021,4,18).setHours(0,0,0,0);
     * const timetableEnd = new Date(2021,4,19).setHours(0,0,0,0);
     */

    const timetable = await session.timetable(timetableStart, timetableEnd);
    const messagerie = await session.messagerie()
    const infos = await session.infos()
    const marks = await session.marks()

    const data = {
        timetable: [],
        messagerie: [],
        infos,
        marks: marks.subjects
    }
    let lastdata = {}

    for (const Class of timetable) {
        if (Class.teacher === process.env.ignored_teacher) {
            continue
        } else if (Class.status) {
            const timehuman = daysName[Class.from.getDay() - 1] + ' ' + Class.from.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
            data.timetable.push({
                id: Class.id,
                time: Class.from,
                timehuman,
                subject: Class.subject,
                teacher: Class.teacher,
                status: Class.status
            })
        }
    }

    for (const messageinfo of messagerie) {
        if (messageinfo.seen === false) {
            const message = await session.message(messageinfo.ConversationId)
            data.messagerie.push({
                date: message.date,
                title: messageinfo.title,
                author: message.author,
                text: message.content,
                files: message.files
            })
        }
    }

    await fs.promises.readFile('lastdata.json')
        .then(lastdataf => {
            if (lastdataf === '') {
                console.log('lastdata.json empty')
                lastdata = data
            }
            lastdata = JSON.parse(lastdataf)
        })
        .catch(err => {
            if (err?.code === 'ENOENT') {
                console.log('lastdata.json doesn\'t exist')
                lastdata = data
            } else {
                throw err
            }
        })

    let toSend = ''
    let newNotif = false
    function send(...messages) {
        if (messages.length > 1) {
            newNotif = true
            toSend += messages.map(e => e + ' ') + '\n\n'
        } else {
            toSend += messages.map(e => e + ' ') + '\n\n'
        }
    }

    send('Timetable :')
    const ClassId = lastdata.timetable.map(e => e.id)
    for (const Class of data.timetable) {
        if (!ClassId.includes(Class.id)) {
            send(Class.timehuman, Class.subject, Class.status)
        }
    }

    send('Infos :')
    const infosId = lastdata.infos.map(e => e.id)
    for (const info of data.infos) {
        if (!infosId.includes(info.id)) {
            send(
                info.title,
                ' : ',
                info.content.replace(/\n/gu, ' ').slice(0, 100),
                info.files.map(e => `<a href="${e.url}" target="_blank">${e.name}</a>`)
            )
        }
    }

    send('Messages : ')
    if (lastdata.messagerie.length === 0) {
        lastdata.messagerie = data.messagerie
    }
    for (const message of data.messagerie) {
        for (const lastmessage of lastdata.messagerie) {
            if (new Date(lastmessage.date).getTime() === message.date.getTime() && lastmessage.text === message.text) {
                if (!lastmessage.lastsent) {
                    send(
                        message.title,
                        message.author,
                        message.text.replace(/\n/gu, ' ').slice(0, 100),
                        message.files?.map(e => `<a href="${e.url}" target="_blank">${e.name}</a>`) || ''
                    )
                    message.lastsent = new Date()
                } else if (new Date() - new Date(lastmessage.lastsent) > 24 * 3600 * 1000) {
                    send('still got messages !', message.title, message.author)
                    message.lastsent = new Date()
                } else {
                    message.lastsent = lastmessage.lastsent
                }
            }
        }
    }

    send('Marks :')
    for (const [index, subject] of data.marks.entries()) {
        const notesId = lastdata.marks[index].marks.map(e => e.id)
        for (const note of subject.marks) {
            if (!notesId.includes(note.id)) {
                send(subject.name, note.title, note.value, '*', note.coefficient)
            }
        }
    }


    if (newNotif) {
        // eslint-disable-next-line camelcase
        telegramnotif(process.env.TgId, process.env.TgToken, toSend, { parse_mode: 'HTML' })
            .catch(e => console.log('error in telegramnotif', e))
    }

    await fs.promises.writeFile('lastdata.json', JSON.stringify(data, null, 4))
})()
    .catch(err => {
        if (err.code === pronote.errors.WRONG_CREDENTIALS.code) {
            console.error('Mauvais identifiants');
        } else {
            console.error(err);
        }
    });
