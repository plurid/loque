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



`loque` provides utility for locating, extracting, and updating data from object-like structures (arbitrarily nested maps and lists) based on a querying syntax.


### Contents

+ [About](#about)
+ [Packages](#packages)



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
    const locatorRecordOne = loque.locate(
        'records.id:1',
    );

    const recordOne = loque.extract(
        locatorRecordOne,
        data,
    );

    const recordsOneTwo = loque.extract(
        'records . id:1 & id:2',
        data,
    );

    const newData = loque.update(
        'records.id:3',
        data,
        {
            value: 'three-modified',
        },
    );

    const lastTwo = loque.extract(
        'records.ownedBy:A |last 4|',
        newData,
    );
}

main();
```



## Packages

<a target="_blank" href="https://www.npmjs.com/package/@plurid/loque">
    <img src="https://img.shields.io/npm/v/@plurid/loque.svg?logo=npm&colorB=1380C3&style=for-the-badge" alt="Version">
</a>

[@plurid/loque-javascript][loque-javascript] • the `JavaScript`/`TypeScript` implementation

[loque-javascript]: https://github.com/plurid/loque/tree/master/packages/loque-javascript
