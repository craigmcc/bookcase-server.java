"use strict"

// Internal Modules ----------------------------------------------------------

const db = require("../models");
const Author = db.Author;
const AuthorServices = require("../services/AuthorServices");
const LibraryServices = require("../services/LibraryServices");
const SeriesServices = require("../services/SeriesServices");
// const StoryServices = require("../services/StoryServices");
const VolumeServices = require("../services/VolumeServices");

// External Modules ----------------------------------------------------------

const csv = require("csvtojson");

// Public Methods ------------------------------------------------------------

// Process a single row from the incoming CSV file, updating results as we go
exports.process = async (library, row, results) => {

    console.info("Process: " + JSON.stringify(row));
    results.countRows = ++results.countRows;

    // Acquire the Author for this row
    let [ author, createdAuthor ] =
        await acquireAuthor(library.id, row.firstName, row.lastName, null);
    if (createdAuthor) {
        results.countAuthors = ++results.countAuthors;
    }
    console.info("Author:  " + JSON.stringify(author, ["id", "firstName", "lastName"]));

    // TODO - Acquire the Story for this row

    // TODO - Assign this Story to this Author (if not already assigned)

    // Acquire the Volume for this row
    let location =  null;
    let media = "Unknown";
    switch (row.box) {
        case "Kindle":    media = "Kindle"; break;
        case "Kobo":      media = "Kobo"; break;
        case "Returned":  media = "Returned"; break;
        case "Unlimited": media = "Unlimited"; break;
        default:          media = "Book"; location = row.box; break;
    }
    let read = ("x" === row.read);
    let [ volume, createdVolume ] =
        await acquireVolume(library.id, location, media, row.name, row.notes, read);
    if (createdVolume) {
        results.countVolumes = ++results.countVolumes;
    }
    console.info("Volume:  " + JSON.stringify(volume, ["id", "name"]));

    // Assign this Volume to this Author (if not already assigned)
    let assignedAuthorVolume =
        await assignAuthorVolume(author.id, volume.id);
    if (assignedAuthorVolume) {
        results.countAuthorsVolumes = ++results.countAuthorsVolumes;
    }

    // TODO - Assign this Story to this Volume (if not already assigned)

    // Acquire the Series for this row, if there is one
    let [ series, createdSeries ] =
        await acquireSeries(library.id, row.seriesName, row.seriesOrdinal);
    if (createdSeries) {
        results.countSeries = ++results.countSeries;
    }
    if (series) {
        console.info("Series:  " + JSON.stringify(series, ["id", "name"]));

        // Assign this Series to this Author (if not already assigned)
        let assignedAuthorSeries =
            await assignAuthorSeries(author.id, series.id);
        if (assignedAuthorSeries) {
            results.countAuthorsSeries = ++results.countAuthorsSeries;
        }

        // TODO: Assign this Story to this Series (if not already assigned)
    }

}

exports.resync = async () => {
    console.info("DevModeServices.resync: Synching and truncating database");
    await db.sequelize.sync({
        force: true,
        truncate: true
    });
    return "DevModeRouters.resync() is complete";
}

// Private Methods -----------------------------------------------------------

const acquireAuthor =
        async (libraryId, firstName, lastName, notes) => {
    let author = { };
    let created = false;
    try {
        author = await LibraryServices.authorExact
            (libraryId, firstName, lastName);
    } catch (err) {
        author = await AuthorServices.insert({
            firstName: firstName,
            lastName: lastName,
            libraryId: libraryId,
            notes: notes
        });
        created = true;
    }
    return [ author, created ];
}

// TODO - deal with seriesOrdinal
const acquireSeries = async (libraryId, seriesName, seriesOrdinal) => {
    if (!seriesName || (seriesName.length === 0)) {
        return [ null, false ];
    }
    let series = { };
    let created = false;
    try {
        series = await LibraryServices.seriesExact(libraryId, seriesName);
    } catch (err) {
        series = await SeriesServices.insert({
            libraryId: libraryId,
            name: seriesName,
        });
        created = true;
    }
    return [ series, created ];
}

// NOTE:  isbn is not included in input data, so not populating that
const acquireVolume =
        async (libraryId, location, media, name, notes, read) => {
    let volume = { };
    let created = false;
    try {
        volume = await LibraryServices.volumeExact(libraryId, name);
    } catch (err) {
        volume = await VolumeServices.insert({
            libraryId: libraryId,
            location: location,
            media: media,
            name: name,
            notes: notes,
            read: read,
        });
        created = true;
    }
    return [ volume, created ];
}

const assignAuthorSeries = async (authorId, seriesId) => {
    try {
        await AuthorServices.seriesAdd(authorId, seriesId);
        return true;
    } catch (err) {
        if (err.message.includes("is already associated")) {
            return false;
        }
        throw err;
    }

}
const assignAuthorVolume = async (authorId, volumeId) => {
    try {
        await AuthorServices.volumeAdd(authorId, volumeId);
        return true;
    } catch (err) {
        if (err.message.includes("is already associated")) {
            return false;
        }
        throw err;
    }

}
