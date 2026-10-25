# Runtime options file for Phantom, written 30/09/2025 07:04:27.9
# Options not present assume their default values
# This file is updated automatically after a full dump

# job name
             logfile =   cte01.log    ! file to which output is directed
            dumpfile =   cte_00025    ! dump file to start from

# options controlling run time and input/output
                tmax =   2.281E+04    ! end time
               dtmax =        100.    ! time between dumps
                nmax =          10    ! maximum number of timesteps (0=just get derivs and stop)
                nout =          -1    ! write dumpfile every n dtmax (-ve=ignore)
           nmaxdumps =          -1    ! stop after n full dumps (-ve=ignore)
            twallmax =      000:00    ! maximum wall time (hhh:mm, 000:00=ignore)
           dtwallmax =      024:00    ! maximum wall time between dumps (hhh:mm, 000:00=ignore)
           nfulldump =           1    ! full dump every n dumps
            iverbose =           0    ! verboseness of log (-1=quiet 0=default 1=allsteps 2=debug 5=max)

# options controlling accuracy
              C_cour =       0.300    ! Courant number
             C_force =       0.250    ! dt_force number
                tolv =   1.000E-02    ! tolerance on v iterations in timestepping
               hfact =       1.200    ! h in units of particle spacing [h = hfact(m/rho)^(1/3)]
                tolh =   1.000E-04    ! tolerance on h-rho iterations

# options controlling hydrodynamics, shock capturing
               alpha =       0.000    ! MINIMUM shock viscosity parameter
            alphamax =       1.000    ! MAXIMUM shock viscosity parameter
              alphau =       1.000    ! shock conductivity parameter
                beta =       2.000    ! beta viscosity
        avdecayconst =       0.100    ! decay time constant for viscosity switches

# options controlling damping
               idamp =           0    ! artificial damping of velocities (0=off, 1=constant, 2=star, 3=disc)

# options controlling equation of state
                ieos =           2    ! eqn of state (1=isoth;2=adiab;3=locally iso;8=barotropic)
                  mu =       2.381    ! mean molecular weight
        ipdv_heating =           1    ! heating from PdV work (0=off, 1=on)
      ishock_heating =           1    ! shock heating (0=off, 1=on)

# options controlling cooling
              C_cool =       0.050    ! factor controlling cooling timestep
            icooling =           0    ! cooling function (0=off, 1=library (step), 2=library (force),3=Gammie, 4=ISM, 5,6=KI02, 7=powerlaw, 9=radiative approx)

# options relating to external forces
      iexternalforce =           2    ! 1=star,2=coro,3=bina,4=prdr,5=toru,6=toys,7=exte,8=spir,9=Lens,10=dens,11=Eins,

# options relating to corotating frame
      omega_corotate =   6.660E-04    ! angular speed of corotating frame
     icompanion_grav =           2    ! 1=add companion potential, 2=add companion and primary core potential
      companion_mass =       1.410    ! mass of companion
      companion_xpos =  221.526229    ! x-position of companion
               hsoft =       1.000    ! softening radius of companion gravity
    primarycore_mass =       6.970    ! mass of primary
    primarycore_xpos =  -44.8137709  ! x-position of primary
   primarycore_hsoft =        100.    ! softening radius of primary core

# options controlling physical viscosity
           irealvisc =           0    ! physical viscosity type (0=none,1=const,2=Shakura/Sunyaev)
          shearparam =       0.100    ! magnitude of shear viscosity (irealvisc=1) or alpha_SS (irealvisc=2)
            bulkvisc =       0.000    ! magnitude of bulk viscosity

# options for injecting/removing particles
               v_inf =  0.014711633036  ! wind speed (code units)
                mach =       1.000    ! mach number of injected particles
       use_mesa_file =           F    ! use mesa data file to specify mdot
                mdot =   1.000E-04    ! mass transfer rate in solar mass / yr
        lattice_type =           1    ! 0: cubic distribution, 1: closepacked distribution
      handled_layers =           4    ! (integer) number of handled BHL wind layers
         wind_radius =  12.1529539    ! radius of the wind cylinder (in code units)
    wind_injection_x =  130.311373    ! x position of the wind injection boundary (in code units)
               rkill =      -1.000    ! deactivate particles outside this radius (<0 is off)

# gravitational waves
                  gw =           F    ! calculate gravitational wave strain
