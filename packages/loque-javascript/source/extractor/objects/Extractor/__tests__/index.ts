// #region imports
    // #region external
    import Extractor from '../';
    // #endregion external
// #endregion imports



// #region module
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


describe('Extractor', () => {
    it.only('collection document', () => {
        const recordsOneTwo = new Extractor(
            'records . id:1 & id:2',
            data,
        );
        console.log('recordsOneTwo', recordsOneTwo);

    });
});
// #endregion module
