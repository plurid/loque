// #region imports
    // #region external
    import {
        CollectionStatement,
        DocumentStatement,
    } from '../../Statement';

    import Locator from '../';
    // #endregion external
// #endregion imports



// #region module
describe('Locator', () => {
    it('collection', () => {
        const location = 'one';
        const locator = new Locator();
        const data = locator.parse(location);

        const collectionStatement = data[0] as CollectionStatement;

        expect(data.length).toEqual(1);

        expect(collectionStatement).toBeInstanceOf(CollectionStatement);
        expect(collectionStatement.name).toEqual('one');
    });



    it('collection document', () => {
        const location = 'one.id:two';
        const locator = new Locator();
        const data = locator.parse(location);

        const collectionStatement = data[0] as CollectionStatement;
        const documentStatement = data[1] as DocumentStatement;

        expect(data.length).toEqual(2);

        expect(collectionStatement).toBeInstanceOf(CollectionStatement);
        expect(collectionStatement.name).toEqual('one');

        expect(documentStatement).toBeInstanceOf(DocumentStatement);
        expect(documentStatement.keys.length).toEqual(1);
        expect(documentStatement.keys[0].key).toEqual('id');
        expect(documentStatement.keys[0].value).toEqual('two');
        expect(documentStatement.keys[0].comparison).toEqual(':');
    });



    it('collection document - and', () => {
        const location = 'one.id:1 & id:2';
        const locator = new Locator();
        const data = locator.parse(location);

        const collectionStatement = data[0] as CollectionStatement;
        const documentStatement = data[1] as DocumentStatement;

        expect(data.length).toEqual(2);

        expect(collectionStatement).toBeInstanceOf(CollectionStatement);
        expect(collectionStatement.name).toEqual('one');

        expect(documentStatement).toBeInstanceOf(DocumentStatement);
        expect(documentStatement.keys.length).toEqual(2);
        expect(documentStatement.keys[0].key).toEqual('id');
        expect(documentStatement.keys[0].value).toEqual('1');
        expect(documentStatement.keys[0].comparison).toEqual(':');
        expect(documentStatement.keys[1].key).toEqual('id');
        expect(documentStatement.keys[1].value).toEqual('2');
        expect(documentStatement.keys[1].comparison).toEqual(':');
    });


    it('collection document collection', () => {
        const location = 'one.id:two.three';
        const locator = new Locator();
        const data = locator.parse(location);

        const collectionStatement1 = data[0] as CollectionStatement;
        const documentStatement = data[1] as DocumentStatement;
        const collectionStatement2 = data[2] as CollectionStatement;

        expect(data.length).toEqual(3);

        expect(collectionStatement1).toBeInstanceOf(CollectionStatement);
        expect(collectionStatement1.name).toEqual('one');

        expect(documentStatement).toBeInstanceOf(DocumentStatement);
        expect(documentStatement.keys.length).toEqual(1);
        expect(documentStatement.keys[0].key).toEqual('id');
        expect(documentStatement.keys[0].value).toEqual('two');
        expect(documentStatement.keys[0].comparison).toEqual(':');

        expect(collectionStatement2).toBeInstanceOf(CollectionStatement);
        expect(collectionStatement2.name).toEqual('three');
    });


    it('collection document collection document', () => {
        const location = 'one.id:two.three.id:four';
        const locator = new Locator();
        const data = locator.parse(location);

        const collectionStatement1 = data[0] as CollectionStatement;
        const documentStatement1 = data[1] as DocumentStatement;
        const collectionStatement2 = data[2] as CollectionStatement;
        const documentStatement2 = data[3] as DocumentStatement;

        expect(data.length).toEqual(4);

        expect(collectionStatement1).toBeInstanceOf(CollectionStatement);
        expect(collectionStatement1.name).toEqual('one');

        expect(documentStatement1).toBeInstanceOf(DocumentStatement);
        expect(documentStatement1.keys.length).toEqual(1);
        expect(documentStatement1.keys[0].key).toEqual('id');
        expect(documentStatement1.keys[0].value).toEqual('two');
        expect(documentStatement1.keys[0].comparison).toEqual(':');

        expect(collectionStatement2).toBeInstanceOf(CollectionStatement);
        expect(collectionStatement2.name).toEqual('three');

        expect(documentStatement2).toBeInstanceOf(DocumentStatement);
        expect(documentStatement2.keys.length).toEqual(1);
        expect(documentStatement2.keys[0].key).toEqual('id');
        expect(documentStatement2.keys[0].value).toEqual('four');
        expect(documentStatement2.keys[0].comparison).toEqual(':');
    });



    // it('collection document', () => {
    //     // const location = 'one.id:two | ab:cd & fg:he & a<b | c>d | f<=g | h>=j |first 2 above 5xz|.three.id!:asd & d<5 & f<=2 & g>1 & h>=1.four';
    //     const location = 'one.id:two.three.id:four';
    //     const locator = new Locator();
    //     const data = locator.parse(location);
    // });



    // it('collection document', () => {
    //     const location = `one.id:'two:special-char'`;
    //     const locator = new Locator();
    //     const data = locator.parse(location);

    // });



    // it('collection document collection', () => {
    //     const location = 'one.id:two.three';
    //     const locator = new Locator();
    //     const data = locator.parse(location);

    // });
});
// #endregion module
