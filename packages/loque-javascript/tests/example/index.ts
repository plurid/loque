/**
 * data contains
 * `one` which is a collection
 * with a document with `id` `1`
 * and a document-(sub)-collection `two`
 * with another document
 *
 * Locators:
 *
 * > `one.id:1` // gets the document
 * > `one.id.1.two` // gets the subcollection
 * > `one.id:1.two.id:1-1` // gets the document from the subcollection
 *
 * > `three` // actually gets the value
 * > `three.id:1` // will fail since `three` is not a collection
 *
 * > `four` // actually gets the value
 * > `four.id:1` // will fail since `four` is not a collection
 */
const data = {
    one: [
        {
            id: '1',
            a: 'document',
            two: [
                {
                    id: '1-1',
                    another: 'document',
                },
            ],
        },
    ],
    three: 'value',
    four: {
        five: 'six',
    },
};
