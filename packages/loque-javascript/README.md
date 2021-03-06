<p align="center">
    <img src="https://raw.githubusercontent.com/plurid/loque/master/about/identity/loque-logo.png" height="250px">
    <br />
    <br />
    <a target="_blank" href="https://github.com/plurid/loque/blob/master/LICENSE">
        <img src="https://img.shields.io/badge/license-DEL-blue.svg?colorB=1380C3&style=for-the-badge" alt="License: DEL">
    </a>
</p>



<h1 align="center">
    loque
</h1>


<h3 align="center">
    Object Data Locator, Extractor, Updater
</h3>


<br />


`loque` provides utility for locating, extracting, and updating data from object-like structures (arbitrarily nested maps and lists) based on a querying syntax.


### Contents

+ [About](#about)
+ [Data](#data)
+ [Packages](#packages)
+ [Codeophon](#codeophon)



## About

Given a collection of data, `loque` selects, retrieves, and modifies values.

Example:

``` typescript
import loque from '@plurid/loque';



const data = {
    records: [
        {
            ownedBy: 'A',
            id: '1',
            value: 'one',
        },
        {
            ownedBy: 'B',
            id: '2',
            value: 'two',
        },
        {
            ownedBy: 'A',
            id: '3',
            value: 'three',
        },
        {
            ownedBy: 'A',
            id: '4',
            value: 'four',
        },
    ],
};


const main = () => {
    // LocatorStatements
    const locatorRecordOne = loque.locate(
        'records.id:1',
    );

    // Extracted data obtained with locator statements.
    // {
    //     ownedBy: 'A',
    //     id: '1',
    //     value: 'one',
    // };
    const recordOne = loque.extract(
        locatorRecordOne,
        data,
    ).data;

    // Extracted data obtained with locator string.
    // [
    //     {
    //         ownedBy: 'A',
    //         id: '1',
    //         value: 'one',
    //     },
    //     {
    //         ownedBy: 'B',
    //         id: '2',
    //         value: 'two',
    //     },
    // ];
    const recordsOneTwo = loque.extract(
        'records . id:1 & id:2',
        data,
    ).data;

    // Updated data with locator string.
    // {
    //     records: [
    //         ...
    //         {
    //             ownedBy: 'A',
    //             id: '3',
    //             value: 'three-modified',
    //         },
    //         ...
    //     ],
    // };
    const newData = loque.update(
        'records.id:3',
        data,
        {
            value: 'three-modified',
        },
    );


    // Extraction with cursor.
    const lastTwo = loque.extract(
        'records.ownedBy:A |last 2|',
        newData,
    ).data;


    const firstTwo = loque.extract(
        'records.ownedBy:A |first 2|',
        newData,
    );

    // Cursor index value of the last document.
    const firstTwoCursor = firstTwo.cursor;

    const nextTwo = loque.extract(
        `records.ownedBy:A |first 2 above ${firstTwoCursor}|`,
        newData,
    ).data;
}

main();
```



## Data

A collection of data is an arbitrary structure composed of `collections` of `documents` and `values`.

``` typescript
const data = {
    // collections
    aCollection: [
    ],

    // or values
    aValue: 'value',
};
```

A `collection` is a specialized `list`.

``` typescript
const data = {
    // a normal list
    list: [
        'one',
        'two,
    ],
    collection: [
        // the first item is always a marker for the collection type
        {
            type: 'collection',
        },

        // the other elements are any type the collection holds
        // and is available to the public interface
        {
            one: 'two',
        },
    ],
}
```

A `value` can be a `number`, a `string`, a `boolean`, a `map`.

A `document` can contain arbitrary `values` and `collections`.



## Packages

<a target="_blank" href="https://www.npmjs.com/package/@plurid/loque">
    <img src="https://img.shields.io/npm/v/@plurid/loque.svg?logo=npm&colorB=1380C3&style=for-the-badge" alt="Version">
</a>

[@plurid/loque-javascript][loque-javascript] • the `JavaScript`/`TypeScript` implementation

[loque-javascript]: https://github.com/plurid/loque/tree/master/packages/loque-javascript



## [Codeophon](https://github.com/ly3xqhl8g9/codeophon)

+ licensing: [delicense](https://github.com/ly3xqhl8g9/delicense)
+ versioning: [αver](https://github.com/ly3xqhl8g9/alpha-versioning)
