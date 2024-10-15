var debug = require('debug')('verbs:auth')
var verb_utils = require('./verb_utils')
var pgp = require('pg-promise')()
var config = require('../../config')

var pool = verb_utils.pool 
var pool_mallas = verb_utils.pool_mallas 

let dic_taxon_data = new Map();
dic_taxon_data.set('especievalidabusqueda','{"reino":"\'||reinovalido||\'","phylum":"\'||phylumdivisionvalido||\'","clase":"\'||clasevalida||\'","orden":"\'||ordenvalido||\'", "familia":"\'||familiavalida||\'", "genero":"\'||generovalido||\'", "especie":"\'||especievalidabusqueda||\'"}')
dic_taxon_data.set('generovalido','{"reino":"\'||reinovalido||\'","phylum":"\'||phylumdivisionvalido||\'","clase":"\'||clasevalida||\'","orden":"\'||ordenvalido||\'", "familia":"\'||familiavalida||\'", "genero":"\'||generovalido||\'"}')
dic_taxon_data.set('familiavalida','{"reino":"\'||reinovalido||\'","phylum":"\'||phylumdivisionvalido||\'","clase":"\'||clasevalida||\'","orden":"\'||ordenvalido||\'", "familia":"\'||familiavalida||\'"}')
dic_taxon_data.set('ordenvalido','{"reino":"\'||reinovalido||\'","phylum":"\'||phylumdivisionvalido||\'","clase":"\'||clasevalida||\'","orden":"\'||ordenvalido||\'"}')
dic_taxon_data.set('clasevalida','{"reino":"\'||reinovalido||\'","phylum":"\'||phylumdivisionvalido||\'","clase":"\'||clasevalida||\'"}')
dic_taxon_data.set('phylumdivisionvalido','{"reino":"\'||reinovalido||\'","phylum":"\'||phylumdivisionvalido||\'"}')
dic_taxon_data.set('reinovalido','{"reino":"\'||reinovalido||\'"}')


let dic_taxon_group = new Map();
dic_taxon_group.set('especievalidabusqueda','especievalidabusqueda, reinovalido, phylumdivisionvalido, clasevalida, ordenvalido, familiavalida, generovalido')
dic_taxon_group.set('generovalido','generovalido, reinovalido, phylumdivisionvalido, clasevalida, ordenvalido, familiavalida')
dic_taxon_group.set('familiavalida','familiavalida, reinovalido, phylumdivisionvalido, clasevalida, ordenvalido')
dic_taxon_group.set('ordenvalido','ordenvalido, reinovalido, phylumdivisionvalido, clasevalida')
dic_taxon_group.set('clasevalida','clasevalida, reinovalido, phylumdivisionvalido')
dic_taxon_group.set('phylumdivisionvalido','phylumdivisionvalido, reinovalido')
dic_taxon_group.set('reinovalido','reinovalido')

exports.variables = function(req, res) {

	let { } = req.body;

	// Se recomienda agregar la columna available_grids a este catalogo con ayuda de los servicios disponibles del proyecto regionmiddleware
	pool.any(`SELECT id, description as variable, level_size, filter_fields, available_grids
			FROM cat_taxonv3 order by id;`, {}).then( 
		function(data) {
			// debug(data);
		res.status(200).json({
			data: data
		})
  	})
  	.catch(error => {
      debug(error)
      res.status(403).json({
      	message: "error al obtener catalogo", 
      	error: error
      })
   	});
}


exports.get_variable_byid = function(req, res) {

	let variable_id = req.params.id
	debug("variable_id: " + variable_id)

	let q = verb_utils.getParam(req, 'q', '')
	let offset = verb_utils.getParam(req, 'offset', 0)
	let limit = verb_utils.getParam(req, 'limit', 10)

	debug("q: " + q)
	debug("offset: " + offset)
	debug("limit: " + limit)

	pool.task(t => {

		return t.one(
			"select id, column_taxon from cat_taxonv3 where id = $<variable_id:raw>", {
				variable_id: variable_id
			}	
		).then(resp => {

			let column_taxon = resp.column_taxon
			debug("column_taxon: " + column_taxon)

			let id = resp.id
			debug("id variable: " + id)
				
			return t.any(
				`select $<id:raw> as id, array_agg(spid) as level_id, ('$<dic_taxon_data:raw>')::json as datos
				from sp_snibv3
				where $<column_taxon:raw> <> ''
				group by $<dic_taxon_group:raw>
				order by $<column_taxon:raw>
				offset $<offset:raw>
				limit $<limit:raw>`, {
					id: id,
					column_taxon:column_taxon,
					dic_taxon_data:dic_taxon_data.get(column_taxon),
					dic_taxon_group: dic_taxon_group.get(column_taxon),
					offset: offset,
					limit: limit
				}	
			).then(resp => {

				res.status(200).json({
					data: resp
				})

			}).catch(error => {
		      debug(error)
		      res.status(403).json({
		      	error: "Error al obtener la malla solicitada", 
		      	message: "error al obtener datos"
		      })
		   	})

		}).catch(error => {
	      debug(error)

	      res.status(403).json({	      	
	      	error: "Error al obtener la malla solicitada", 
	      	message: "error al obtener datos"
	      })
	   	})

	}).catch(error => {
      debug(error)
      res.status(403).json({
      	message: "error general", 
      	error: error
      })
   	});
  	
}


exports.get_data_byid = function(req, res) {

	let id = req.params.id
	debug("id: " + id)

	let grid_id = verb_utils.getParam(req, 'grid_id', 1)
	debug("grid_id: " + grid_id)

	let levels_id = verb_utils.getParam(req, 'levels_id', [])
	debug("levels_id: " + levels_id)

	let filter_names = verb_utils.getParam(req, 'filter_names', [])
	debug("filter_names: " + filter_names)

	let filter_values = verb_utils.getParam(req, 'filter_values', [])
	debug("filter_values: " + filter_values)

	// TODO: validaciones para verificar los filtros

	let filter_array = []

	filter_names.forEach((filter_name, index) => {
		let filter_temp = {}
		filter_temp = {filter_param: filter_name, filter_value: filter_values[index]}
	})
	debug(filter_array)

	let filter_query = ""

	filter_array.forEach((filter_item) => {

		switch (filter_item.filter_param) {
		    case "min_occ":
		        debug("min_occ");

				filter_item.filter_query = " having array_length(array_agg(st_astext(the_geom)),1) > " + filter_item.filter_value + " "
		        
		        break;

		    case "in_fosil":
		        debug("Incluir registros fosil");

		        if(filter_item.filter_value){
		        	filter_item.filter_query = " "	
		        }
		        else{
		        	filter_item.filter_query = " and ejemplarfosil == 'NO' "		
		        }
		        
		        break;

		    case "in_sin_fecha":
		    	debug("Incluir registros sin fecha");

		    	if(filter_item.filter_value){
		        	filter_item.filter_query = " "
		        }
		        else{
		        	filter_item.filter_query = " and (fechacolecta is not null and fechacolecta <> '9999-99-99') "
		        }
		        
		        break;

		    default:
		        console.log("Filtro no valido: " + filter_item.filter_param);
		}
		
	})


	pool.task(t => {

		let query = `select spid, array_agg(st_astext(the_geom)) as points 
			from snib s
			where spid in ($<spids:raw>)  
			and the_geom is not null
			group by spid`

		

		return t.any(query, {
				spids: levels_id.toString()
			}	
		).then(resp => {

			let datapoints = resp
			
			let cells = []
			let query_array = []

			datapoints.forEach((points_byspid) => {
				
				let query_temp = ""
				let query_points = ""

				if(points_byspid.points == null || points_byspid.points.length == 0){
					debug("el " + points_byspid.spid + " no tiene occurrencias registradas")
					return
				}

				points_byspid.points.forEach((point, index) => {

					if(index==0){
						query_points = query_points + " ST_SetSRID(ST_GeomFromText('" + point + "'), 4326)"	
					}
					else{
						query_points = query_points + ", ST_SetSRID(ST_GeomFromText('" + point + "'), 4326)"
					}
					
				})

				query_temp = `WITH puntos AS (
					    SELECT ARRAY[{query_points}] AS geom_array
					),
					point_geom as (
						SELECT unnest(geom_array) as geom 
						from puntos as p
					)
					select g.gridid_64km as cell
					from point_geom as p
					join grid_64km_aoi as g 
					ON ST_Intersects(g.the_geom, p.geom);`

				query_temp = query_temp.replace("{query_points}", query_points)
				query_array.push({query_temp: query_temp, spid: points_byspid.spid}) 
				
			})

			// debug(query_array)

			
			// contrucción de respuesta
			let peticiones = query_array.length
			let response_array = []

			query_array.forEach((query_str) => {

				pool_mallas.task(t => {

					return t.any(
						query_str.query_temp, {}	
					).then(resp => {

						// enviando respuesta hasta que se reciban todas las peticiones del array
						peticiones = peticiones - 1

						// agrupacion de celdas de la respuesta del query
						let cells = resp.map(obj => {
						  return obj.cell
						});

						response_array.push({
							id: id,
							grid_id: grid_id,
							level_id: query_str.spid,
							cells: cells,
							n: cells.length
						})

						if(peticiones == 0){
							res.status(200).json(
								response_array
							)
						}
						
						
					})
				}).catch(error => {
			      debug(error)
			      peticiones = peticiones - 1
			      // res.status(403).json({
			      // 	message: "error general", 
			      // 	error: error
			      // })
			   	});

			})
			

		}).catch(error => {
	      debug(error)

	      res.status(403).json({	      	
	      	error: "Error al obtener la malla solicitada", 
	      	message: "error al obtener datos"
	      })
	   	})


	}).catch(error => {
      debug(error)
      res.status(403).json({
      	message: "error general", 
      	error: error
      })
   	});




	

	
  	
}
